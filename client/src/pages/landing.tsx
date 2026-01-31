import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Upload, 
  Palette, 
  FileCheck, 
  Zap, 
  Shield, 
  Layers,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Clock,
  Target,
  Printer
} from "lucide-react";
import { useLocation } from "wouter";

export default function LandingPage() {
  const [, setLocation] = useLocation();

  const features = [
    {
      icon: Upload,
      title: "Drag & Drop Upload",
      description: "Simply drag your artwork files onto the canvas. We support PDF, SVG, AI, and image files."
    },
    {
      icon: Palette,
      title: "CMYK Color Preservation",
      description: "Your exact colors are preserved throughout the process. No color shifts, no surprises."
    },
    {
      icon: Target,
      title: "Precise Positioning",
      description: "Position your logos exactly where you need them with pixel-perfect accuracy."
    },
    {
      icon: Layers,
      title: "Multi-Color Orders",
      description: "Order the same design on multiple garment colors in one go. Save time on repeat orders."
    },
    {
      icon: FileCheck,
      title: "Production-Ready PDFs",
      description: "Generate print-ready PDFs with correct bleeds, margins, and color profiles instantly."
    },
    {
      icon: Zap,
      title: "Instant Preview",
      description: "See exactly how your transfers will look before ordering. No guesswork required."
    }
  ];

  const benefits = [
    "Professional heat transfer designs in minutes",
    "Automatic CMYK conversion for perfect prints",
    "Support for vector and raster artwork",
    "Multi-page PDFs for multi-color garments",
    "Direct integration with your shopping cart",
    "No design software required"
  ];

  const steps = [
    {
      number: "01",
      title: "Choose Your Template",
      description: "Select from our range of transfer sizes and types - Full Colour, HD, Metallic, and more."
    },
    {
      number: "02",
      title: "Upload Your Artwork",
      description: "Drag and drop your logo or design. We handle all the technical conversions for you."
    },
    {
      number: "03",
      title: "Position & Preview",
      description: "Place your design exactly where you want it. See a live preview on your chosen garment color."
    },
    {
      number: "04",
      title: "Add to Cart",
      description: "Generate your production-ready PDF and add directly to your cart. It's that simple."
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-transparent to-primary/5" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-3xl" />
        
        <div className="container mx-auto px-4 py-20 md:py-32 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-6">
              <Sparkles className="h-4 w-4" />
              Professional Heat Transfers Made Easy
            </div>
            
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6 bg-gradient-to-r from-foreground via-foreground to-foreground/70 bg-clip-text">
              Design Your Transfers
              <span className="block text-primary">In Minutes, Not Hours</span>
            </h1>
            
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Upload your artwork, position it perfectly, and generate production-ready PDFs. 
              Our intuitive design tool handles all the technical details so you can focus on what matters.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg" 
                className="text-lg px-8 py-6 group"
                onClick={() => setLocation("/")}
              >
                Start Designing Now
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button 
                size="lg" 
                variant="outline" 
                className="text-lg px-8 py-6"
                onClick={() => {
                  const el = document.getElementById('how-it-works');
                  el?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                See How It Works
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 border-y bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-3xl md:text-4xl font-bold text-primary">50+</div>
              <div className="text-sm text-muted-foreground mt-1">Template Options</div>
            </div>
            <div>
              <div className="text-3xl md:text-4xl font-bold text-primary">27</div>
              <div className="text-sm text-muted-foreground mt-1">Garment Colors</div>
            </div>
            <div>
              <div className="text-3xl md:text-4xl font-bold text-primary">100%</div>
              <div className="text-sm text-muted-foreground mt-1">CMYK Accurate</div>
            </div>
            <div>
              <div className="text-3xl md:text-4xl font-bold text-primary">&lt;2min</div>
              <div className="text-sm text-muted-foreground mt-1">Average Design Time</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 md:py-28">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Everything You Need</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Powerful features designed to make your workflow faster and your results better.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <Card key={index} className="border-2 hover:border-primary/50 transition-colors group">
                  <CardContent className="p-6">
                    <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                      <Icon className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                    <p className="text-muted-foreground">{feature.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 md:py-28 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">How It Works</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              From artwork to order in four simple steps.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-6xl mx-auto">
            {steps.map((step, index) => (
              <div key={index} className="relative">
                <div className="text-6xl font-bold text-primary/20 mb-4">{step.number}</div>
                <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
                <p className="text-muted-foreground">{step.description}</p>
                {index < steps.length - 1 && (
                  <ArrowRight className="hidden lg:block absolute top-8 -right-4 h-6 w-6 text-muted-foreground/30" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-20 md:py-28">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-3xl md:text-4xl font-bold mb-6">
                  Why Choose Our Design Tool?
                </h2>
                <p className="text-lg text-muted-foreground mb-8">
                  We've built this tool specifically for heat transfer professionals. 
                  Every feature is designed to save you time and deliver perfect results.
                </p>
                <ul className="space-y-4">
                  {benefits.map((benefit, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>
              </div>
              
              <div className="relative">
                <div className="aspect-square rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent p-8 flex items-center justify-center">
                  <div className="grid grid-cols-2 gap-4 w-full max-w-xs">
                    <div className="aspect-square rounded-xl bg-background shadow-lg flex items-center justify-center">
                      <Clock className="h-10 w-10 text-primary" />
                    </div>
                    <div className="aspect-square rounded-xl bg-background shadow-lg flex items-center justify-center">
                      <Shield className="h-10 w-10 text-primary" />
                    </div>
                    <div className="aspect-square rounded-xl bg-background shadow-lg flex items-center justify-center">
                      <Printer className="h-10 w-10 text-primary" />
                    </div>
                    <div className="aspect-square rounded-xl bg-background shadow-lg flex items-center justify-center">
                      <Sparkles className="h-10 w-10 text-primary" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 md:py-28 bg-primary text-primary-foreground">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Ready to Create Your First Design?
          </h2>
          <p className="text-xl opacity-90 mb-8 max-w-2xl mx-auto">
            Join thousands of satisfied customers who trust our tool for their heat transfer designs.
          </p>
          <Button 
            size="lg" 
            variant="secondary"
            className="text-lg px-8 py-6 group"
            onClick={() => setLocation("/")}
          >
            Get Started Free
            <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t">
        <div className="container mx-auto px-4 text-center text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} Complete Transfers. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
