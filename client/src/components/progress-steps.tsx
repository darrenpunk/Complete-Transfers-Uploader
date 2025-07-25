import { CheckCircle, Circle } from "lucide-react";

interface ProgressStepsProps {
  currentStep: number;
}

const steps = [
  { id: 1, title: "Upload Logos" },
  { id: 2, title: "Design Layout" },
  { id: 3, title: "Pre-flight Check" },
  { id: 4, title: "Generate PDF" },
  { id: 5, title: "Attach to Order" },
];

export default function ProgressSteps({ currentStep }: ProgressStepsProps) {
  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Workflow Progress</h3>
      <div className="space-y-3">
        {steps.map((step) => (
          <div key={step.id} className="flex items-center space-x-3">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                step.id < currentStep
                  ? "bg-green-500 text-white"
                  : step.id === currentStep
                  ? "bg-primary text-white"
                  : "bg-gray-200 text-gray-400"
              }`}
            >
              {step.id < currentStep ? (
                <CheckCircle className="w-4 h-4" />
              ) : (
                step.id
              )}
            </div>
            <span
              className={`text-sm ${
                step.id === currentStep
                  ? "font-medium text-gray-900"
                  : step.id < currentStep
                  ? "text-gray-600"
                  : "text-gray-400"
              }`}
            >
              {step.title}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
