export interface Product {
  id: string;
  name: string;
  description: string;
  image: string;
}

export interface Template {
  id: string;
  name: string;
  width: number;
  height: number;
  description?: string;
}

export interface GarmentColor {
  id: string;
  name: string;
  color: string;
  manufacturer?: 'gildan' | 'fruit-of-the-loom';
}

export interface Project {
  id: string;
  name: string;
  productType: string;
  templateSize: string;
  garmentColor: string;
  logoFile?: string;
  canvasData?: any;
}

export interface WorkflowStep {
  id: number;
  name: string;
  description: string;
  completed: boolean;
}