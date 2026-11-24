import PageHeader from "../components/PageHeader";
import RobustnessLab from "../components/RobustnessLab";

export default function Robustness() {
  return (
    <div className="space-y-6 pb-16">
      <PageHeader title="Robustness laboratory" description="Compare the same road image under low light, motion blur, noise and compression. Ground-truth labels are needed to calculate accuracy changes." />
      <RobustnessLab />
    </div>
  );
}
