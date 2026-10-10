export type Vec3 = [number, number, number];

export interface Room {
  id: string;
  name: string;
  position: Vec3;
  size: Vec3;
}

export interface Wall {
  id: string;
  position: Vec3;
  size: Vec3;
}

export interface Door {
  id: string;
  roomId: string;
  position: Vec3;
  width: number;
  /** Orientation of the wall this door sits in (true = runs along X, false = runs along Z). Defaults to true if omitted. */
  horizontal?: boolean;
}

export interface Obstacle {
  id: string;
  type: string;
  position: Vec3;
  size: Vec3;
  hazard?: boolean;
}

export interface Stairs {
  id: string;
  position: Vec3;
  size: Vec3;
  direction: 'up' | 'down';
}

export interface OfficeData {
  id: string;
  name: string;
  rooms: Room[];
  walls: Wall[];
  doors: Door[];
  obstacles: Obstacle[];
  stairs: Stairs[];
}

export type Severity = 'low' | 'medium' | 'high';

export type IssueType =
  | 'missingTactileWarning'
  | 'missingSignage'
  | 'missingContrastStrip'
  | 'noAccessibleAlternative'
  | 'narrowPath'
  | 'narrowDoorway';

export interface Issue {
  id: string;
  moduleId: string;
  issueType: IssueType;
  severity: Severity;
  locationId: string;
  position: Vec3;
  description: string;
  standardReference: string;
}

export type FixType =
  | 'tactilePaving'
  | 'brailleSignage'
  | 'contrastStrip'
  | 'wheelchairRamp'
  | 'doorWidening'
  | 'clearFloorMarking';

export interface Product {
  sku: string;
  name: string;
  unitCost: number;
  unit: string;
  estimatedQuantity: number;
}

export interface Fix {
  issueId: string;
  type: FixType;
  position: Vec3;
  rotation?: Vec3;
  product: Product;
}

export interface Module {
  id: string;
  name: string;
  analyze(officeData: OfficeData): Issue[];
  fixesFor(issue: Issue): Fix[];
}
