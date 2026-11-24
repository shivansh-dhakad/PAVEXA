/**
 * src/lib/geoExtractor.ts
 * Zero-dependency GPS & location extraction from JPEG/WebP images and MP4/MOV videos.
 * Extracts EXIF GPS tags (0x8825) and ISO-6709 video metadata coordinates.
 */

export interface ExtractedLocation {
  latitude: number;
  longitude: number;
  altitude?: number;
  source: "exif_image" | "meta_video" | "manual" | "geolocation";
}

/**
 * Extracts GPS coordinates from an image or video File.
 * Returns null if no GPS metadata was embedded.
 */
export async function extractMediaCoordinates(file: File): Promise<ExtractedLocation | null> {
  try {
    if (file.type.startsWith("image/")) {
      return await extractImageExifGps(file);
    } else if (file.type.startsWith("video/")) {
      return await extractVideoGps(file);
    }
  } catch (err) {
    console.warn("[geoExtractor] Failed to extract coordinates from media:", err);
  }
  return null;
}

/**
 * Reverse geocode latitude and longitude to road/city name.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const fallback = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&lat=${lat}&lon=${lng}`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (!res.ok) return fallback;
    const data = await res.json();
    const a = data.address ?? {};
    const parts = [
      a.road ?? a.neighbourhood ?? a.suburb ?? a.pedestrian,
      a.city ?? a.town ?? a.village ?? a.county,
    ].filter(Boolean);
    return parts.join(", ") || a.display_name?.split(",").slice(0, 2).join(",") || fallback;
  } catch {
    return fallback;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// JPEG EXIF GPS Parser
// ─────────────────────────────────────────────────────────────────────────────

async function extractImageExifGps(file: File): Promise<ExtractedLocation | null> {
  // Read first 128KB of image where EXIF header resides
  const slice = file.slice(0, 131072);
  const buffer = await slice.arrayBuffer();
  const view = new DataView(buffer);

  // Check JPEG SOI (0xFFD8)
  if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) {
    return null;
  }

  let offset = 2;
  const length = view.byteLength;

  while (offset + 4 < length) {
    const marker = view.getUint16(offset, false);
    offset += 2;

    if (marker === 0xffe1) {
      // APP1 Marker (EXIF)
      const app1Length = view.getUint16(offset, false);
      const exifStart = offset + 2;

      // Verify "Exif\0\0" header (0x45786966 0x0000)
      if (
        view.getUint32(exifStart, false) === 0x45786966 &&
        view.getUint16(exifStart + 4, false) === 0x0000
      ) {
        const tiffStart = exifStart + 6;
        return parseTiffForGps(view, tiffStart, app1Length - 8);
      }
      offset += app1Length;
    } else if ((marker & 0xff00) === 0xff00 && marker !== 0xff00) {
      // Other JPEG marker, skip by its payload length
      if (marker === 0xffda || marker === 0xffd9) {
        // Start of Scan or End of Image
        break;
      }
      const markerLen = view.getUint16(offset, false);
      offset += markerLen;
    } else {
      offset++;
    }
  }

  return null;
}

function parseTiffForGps(
  view: DataView,
  tiffStart: number,
  maxLen: number
): ExtractedLocation | null {
  if (tiffStart + 8 > view.byteLength) return null;

  // Byte order: 0x4949 = II (Little Endian), 0x4D4D = MM (Big Endian)
  const byteOrderMarker = view.getUint16(tiffStart, false);
  const littleEndian = byteOrderMarker === 0x4949;
  if (!littleEndian && byteOrderMarker !== 0x4d4d) return null;

  // 0x002A check
  const magic = view.getUint16(tiffStart + 2, littleEndian);
  if (magic !== 0x002a) return null;

  // Offset to IFD0
  const ifd0Offset = view.getUint32(tiffStart + 4, littleEndian);
  if (ifd0Offset < 8 || ifd0Offset > maxLen) return null;

  const ifd0Start = tiffStart + ifd0Offset;
  if (ifd0Start + 2 > view.byteLength) return null;

  const ifd0Entries = view.getUint16(ifd0Start, littleEndian);
  let gpsOffset = 0;

  for (let i = 0; i < ifd0Entries; i++) {
    const entryOffset = ifd0Start + 2 + i * 12;
    if (entryOffset + 12 > view.byteLength) break;

    const tag = view.getUint16(entryOffset, littleEndian);
    if (tag === 0x8825) {
      // GPS IFD Pointer Tag
      gpsOffset = view.getUint32(entryOffset + 8, littleEndian);
      break;
    }
  }

  if (!gpsOffset) return null;

  const gpsStart = tiffStart + gpsOffset;
  if (gpsStart + 2 > view.byteLength) return null;

  const gpsEntries = view.getUint16(gpsStart, littleEndian);

  let latRef = "N";
  let lngRef = "E";
  let latCoords: number[] | null = null;
  let lngCoords: number[] | null = null;
  let altitude: number | undefined;

  for (let i = 0; i < gpsEntries; i++) {
    const entryOffset = gpsStart + 2 + i * 12;
    if (entryOffset + 12 > view.byteLength) break;

    const tag = view.getUint16(entryOffset, littleEndian);
    const valueOrOffset = view.getUint32(entryOffset + 8, littleEndian);

    if (tag === 0x0001) {
      // GPSLatitudeRef (ASCII)
      latRef = String.fromCharCode(view.getUint8(entryOffset + 8)).toUpperCase();
    } else if (tag === 0x0002) {
      // GPSLatitude (3 RATIONALs: deg, min, sec)
      latCoords = readRationals(view, tiffStart + valueOrOffset, 3, littleEndian);
    } else if (tag === 0x0003) {
      // GPSLongitudeRef (ASCII)
      lngRef = String.fromCharCode(view.getUint8(entryOffset + 8)).toUpperCase();
    } else if (tag === 0x0004) {
      // GPSLongitude (3 RATIONALs: deg, min, sec)
      lngCoords = readRationals(view, tiffStart + valueOrOffset, 3, littleEndian);
    } else if (tag === 0x0006) {
      // GPSAltitude
      const altRat = readRationals(view, tiffStart + valueOrOffset, 1, littleEndian);
      if (altRat && altRat.length > 0) altitude = altRat[0];
    }
  }

  if (!latCoords || !lngCoords || latCoords.length < 3 || lngCoords.length < 3) {
    return null;
  }

  const degLat = latCoords[0] + latCoords[1] / 60 + latCoords[2] / 3600;
  const latitude = (latRef === "S" ? -1 : 1) * degLat;

  const degLng = lngCoords[0] + lngCoords[1] / 60 + lngCoords[2] / 3600;
  const longitude = (lngRef === "W" ? -1 : 1) * degLng;

  if (isNaN(latitude) || isNaN(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;

  return {
    latitude: Math.round(latitude * 1000000) / 1000000,
    longitude: Math.round(longitude * 1000000) / 1000000,
    altitude,
    source: "exif_image",
  };
}

function readRationals(
  view: DataView,
  offset: number,
  count: number,
  littleEndian: boolean
): number[] | null {
  const result: number[] = [];
  for (let i = 0; i < count; i++) {
    const pos = offset + i * 8;
    if (pos + 8 > view.byteLength) return null;
    const num = view.getUint32(pos, littleEndian);
    const den = view.getUint32(pos + 4, littleEndian);
    if (den === 0) return null;
    result.push(num / den);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// MP4 / MOV Video Metadata Parser (ISO 6709 coordinates)
// ─────────────────────────────────────────────────────────────────────────────

async function extractVideoGps(file: File): Promise<ExtractedLocation | null> {
  // Read first 512KB where moov/udta box often sits
  const slice = file.slice(0, 524288);
  const buffer = await slice.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const text = new TextDecoder("latin1").decode(bytes);

  // Look for ISO-6709 location string pattern: e.g. +12.2958+076.6394/ or +12.2958-076.6394+120.000/
  const isoMatch = text.match(/([+-]\d{2,3}(?:\.\d+)?)([+-]\d{2,3}(?:\.\d+)?)(?:([+-]\d+(?:\.\d+)?))?\//);
  if (isoMatch) {
    const lat = parseFloat(isoMatch[1]);
    const lng = parseFloat(isoMatch[2]);
    const alt = isoMatch[3] ? parseFloat(isoMatch[3]) : undefined;

    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return {
        latitude: Math.round(lat * 1000000) / 1000000,
        longitude: Math.round(lng * 1000000) / 1000000,
        altitude: alt,
        source: "meta_video",
      };
    }
  }

  return null;
}
