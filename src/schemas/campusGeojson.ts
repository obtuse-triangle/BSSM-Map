import { z } from "zod";

// ─── Shared primitives ──────────────────────────────────────────

const positionSchema = z.tuple([z.number(), z.number()]);

// ─── Category enum ──────────────────────────────────────────────

export const campusFeatureCategory = z.enum([
  "room",
  "classroom",
  "office",
  "corridor",
  "stair",
  "elevator",
  "restroom",
  "outdoor",
  "parking",
  "facility",
  "structural",
  "unknown",
]);

export type CampusFeatureCategory = z.infer<typeof campusFeatureCategory>;

// ─── CampusFeatureProperties ────────────────────────────────────

export const campusFeaturePropertiesSchema = z.object({
  name: z.string(),
  name_ko: z.string(),
  level: z.number(),
  level_id: z.string(),
  building_id: z.string(),
  category: campusFeatureCategory,
  interactive: z.boolean(),
  source: z.string(),
});

export type CampusFeatureProperties = z.infer<
  typeof campusFeaturePropertiesSchema
>;

// ─── Polygon Geometry (closed-ring validated) ───────────────────

const linearRingSchema = z.array(positionSchema).min(4);
const polygonCoordinatesSchema = z.array(linearRingSchema).min(1);

export const polygonGeometrySchema = z
  .object({
    type: z.literal("Polygon"),
    coordinates: polygonCoordinatesSchema,
  })
  .refine(
    (geom) => {
      for (const ring of geom.coordinates) {
        if (ring.length === 0) continue;
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) {
          return false;
        }
      }
      return true;
    },
    {
      message:
        "Each polygon ring must be closed (first coordinate must equal last coordinate)",
    },
  );

export type PolygonGeometry = z.infer<typeof polygonGeometrySchema>;

// ─── CampusFeature ──────────────────────────────────────────────

export const campusFeatureSchema = z.object({
  type: z.literal("Feature"),
  geometry: polygonGeometrySchema,
  properties: campusFeaturePropertiesSchema,
});

export type CampusFeature = z.infer<typeof campusFeatureSchema>;

// ─── CampusFeatureCollection ────────────────────────────────────

export const campusFeatureCollectionSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(campusFeatureSchema),
  metadata: z.object({
    coordinateSystem: z.literal("local"),
    units: z.literal("source-normalized"),
  }),
});

export type CampusFeatureCollection = z.infer<
  typeof campusFeatureCollectionSchema
>;

// ─── ControlPoint ───────────────────────────────────────────────

export const controlPointRole = z.enum(["control", "checkpoint"]);

export const controlPointSchema = z.object({
  id: z.string(),
  label: z.string(),
  local: z.tuple([z.number(), z.number()]),
  lngLat: z.tuple([z.number(), z.number()]),
  role: controlPointRole,
});

export type ControlPoint = z.infer<typeof controlPointSchema>;

// ─── GeoreferenceMetadata ───────────────────────────────────────

export const georeferenceMetadataSchema = z.object({
  transformType: z.string(),
  coefficients: z.array(z.number()),
  residuals: z.array(
    z.object({
      pointId: z.string(),
      dx: z.number(),
      dy: z.number(),
    }),
  ),
  rms: z.number().nonnegative(),
  maxResidual: z.number().nonnegative(),
});

export type GeoreferenceMetadata = z.infer<
  typeof georeferenceMetadataSchema
>;
