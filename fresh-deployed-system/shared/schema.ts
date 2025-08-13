// Fresh deployed system - minimal schema
export interface Logo {
  id: string;
  filename: string;
  originalName?: string;
  path?: string;
}

export interface CanvasElement {
  id: string;
  logoId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TemplateSize {
  id: string;
  name: string;
  width: number;
  height: number;
}

export interface Project {
  id: string;
  name: string;
  templateSize: string;
  garmentColor?: string;
}
