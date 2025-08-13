import { CheckCircle, Circle } from "lucide-react";

interface ProgressStepsProps {
  currentStep: number;
  layout?: 'vertical' | 'horizontal';
}

const steps = [
  { id: 1, title: "Upload Logos" },
  { id: 2, title: "Design Layout" },
  { id: 3, title: "Pre-flight Check" },
  { id: 4, title: "Generate PDF" },
  { id: 5, title: "Attach to Order" },
];

export default function ProgressSteps({ currentStep, layout = 'vertical' }: ProgressStepsProps) {
  if (layout === 'horizontal') {
    return (
      <div className="flex items-center justify-center max-w-4xl mx-auto">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center">
            {/* Step Circle */}
            <div className="flex flex-col items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium ${
                  step.id < currentStep
                    ? "bg-green-500 text-white"
                    : step.id === currentStep
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 text-gray-500"
                }`}
              >
                {step.id < currentStep ? (
                  <CheckCircle className="w-5 h-5" />
                ) : (
                  step.id
                )}
              </div>
              <span
                className={`mt-2 text-xs font-medium text-center max-w-20 ${
                  step.id === currentStep
                    ? "text-blue-600"
                    : step.id < currentStep
                    ? "text-green-600"
                    : "text-gray-400"
                }`}
              >
                {step.title}
              </span>
            </div>
            
            {/* Connector Line */}
            {index < steps.length - 1 && (
              <div 
                className={`w-16 h-0.5 mx-4 ${
                  step.id < currentStep ? "bg-green-500" : "bg-gray-200"
                }`}
              />
            )}
          </div>
        ))}
      </div>
    );
  }

  // Original vertical layout
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
