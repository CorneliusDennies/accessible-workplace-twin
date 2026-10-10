import { ApiError, GoogleGenAI } from '@google/genai';

export interface SimpleWall {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
}
export interface SimplePoint {
  x: number;
  z: number;
}
export interface SimpleRect {
  x: number;
  z: number;
  width: number;
  depth: number;
}
export interface SimpleFloorPlan {
  walls: SimpleWall[];
  doors: SimplePoint[];
  stairs: SimpleRect[];
  obstacles: SimpleRect[];
}

const FLOOR_PLAN_JSON_SCHEMA = {
  type: 'object',
  properties: {
    walls: {
      type: 'array',
      description: 'Each wall as a straight line segment from (x1,z1) to (x2,z2), in meters.',
      items: {
        type: 'object',
        properties: {
          x1: { type: 'number' },
          z1: { type: 'number' },
          x2: { type: 'number' },
          z2: { type: 'number' },
        },
        required: ['x1', 'z1', 'x2', 'z2'],
      },
    },
    doors: {
      type: 'array',
      description: 'Each door as a single point (x,z) where it sits, in meters.',
      items: {
        type: 'object',
        properties: {
          x: { type: 'number' },
          z: { type: 'number' },
        },
        required: ['x', 'z'],
      },
    },
    stairs: {
      type: 'array',
      description: 'Each staircase as a bounding box: center (x,z) plus width and depth, in meters.',
      items: {
        type: 'object',
        properties: {
          x: { type: 'number' },
          z: { type: 'number' },
          width: { type: 'number' },
          depth: { type: 'number' },
        },
        required: ['x', 'z', 'width', 'depth'],
      },
    },
    obstacles: {
      type: 'array',
      description:
        'Each fixed obstruction (pillar, built-in counter, large fixed furniture) as a bounding box: center (x,z) plus width and depth, in meters.',
      items: {
        type: 'object',
        properties: {
          x: { type: 'number' },
          z: { type: 'number' },
          width: { type: 'number' },
          depth: { type: 'number' },
        },
        required: ['x', 'z', 'width', 'depth'],
      },
    },
  },
  required: ['walls', 'doors', 'stairs', 'obstacles'],
};

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set. Add it to server/.env');
  }
  return new GoogleGenAI({ apiKey });
}

const RETRYABLE_STATUSES = new Set([429, 500, 503, 504]);
const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 1000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(err: unknown): boolean {
  return err instanceof ApiError && RETRYABLE_STATUSES.has(err.status);
}

export async function parseFloorPlanImage(imageBase64: string, mediaType: string): Promise<SimpleFloorPlan> {
  const ai = getClient();

  let response;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      response = await ai.models.generateContent({
        model: 'gemini-flash-latest',
        contents: [
          {
            text:
              'This is a top-down floor plan (a photo or scan of a drawn/printed plan). Extract its geometry: ' +
              'every wall as a line segment, every door as a point, every staircase and large fixed obstacle as a ' +
              'bounding box. Pick a sensible real-world scale in meters (use any printed dimensions/scale bar if ' +
              'present; otherwise estimate from typical door widths around 0.9m and room sizes). Use a consistent ' +
              'top-down x/z coordinate system with (0,0) near a corner of the plan. Respond only with the structured ' +
              'data described by the schema.',
          },
          { inlineData: { data: imageBase64, mimeType: mediaType } },
        ],
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema: FLOOR_PLAN_JSON_SCHEMA,
        },
      });
      break;
    } catch (err) {
      const isLastAttempt = attempt === MAX_ATTEMPTS;
      if (!isRetryable(err) || isLastAttempt) {
        throw err;
      }
      const delay = BASE_DELAY_MS * 2 ** (attempt - 1);
      console.warn(
        `Gemini request failed (attempt ${attempt}/${MAX_ATTEMPTS}, status ${
          err instanceof ApiError ? err.status : '?'
        }), retrying in ${delay}ms...`
      );
      await sleep(delay);
    }
  }

  const text = response!.text;
  if (!text) {
    throw new Error('No structured floor plan data was returned.');
  }

  return JSON.parse(text) as SimpleFloorPlan;
}
