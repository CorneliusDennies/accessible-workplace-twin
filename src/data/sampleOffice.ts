import type { OfficeData } from '../types';

export const sampleOffice: OfficeData = {
  id: 'sample-office-1',
  name: 'Sample Office',
  rooms: [
    { id: 'room-reception', name: 'Reception', position: [-5, 0, 0], size: [6, 3, 8] },
    { id: 'room-openoffice', name: 'Open Office', position: [5, 0, 0], size: [6, 3, 8] },
  ],
  walls: [
    // Perimeter walls. Hallway runs along x=0 between the two rooms.
    { id: 'wall-north', position: [0, 1.5, -5], size: [16, 3, 0.2] },
    { id: 'wall-south', position: [0, 1.5, 5], size: [16, 3, 0.2] },
    { id: 'wall-west', position: [-8, 1.5, 0], size: [0.2, 3, 10] },
    { id: 'wall-east', position: [8, 1.5, 0], size: [0.2, 3, 10] },
    // Interior walls separating each room from the hallway, split to leave a doorway gap.
    { id: 'wall-reception-north', position: [-2, 1.5, -2.75], size: [0.2, 3, 4.5] },
    { id: 'wall-reception-south', position: [-2, 1.5, 2.75], size: [0.2, 3, 4.5] },
    { id: 'wall-openoffice-north', position: [2, 1.5, -2.75], size: [0.2, 3, 4.5] },
    { id: 'wall-openoffice-south', position: [2, 1.5, 2.75], size: [0.2, 3, 4.5] },
  ],
  doors: [
    { id: 'door-reception', roomId: 'room-reception', position: [-2, 0, 0], width: 1 },
    { id: 'door-openoffice', roomId: 'room-openoffice', position: [2, 0, 0], width: 1 },
  ],
  obstacles: [
    { id: 'obstacle-pillar', type: 'pillar', position: [0, 0.75, 1.5], size: [0.4, 1.5, 0.4], hazard: true },
  ],
  stairs: [
    { id: 'stairs-main', position: [0, 0, -3.5], size: [2, 0.5, 2], direction: 'down' },
  ],
};
