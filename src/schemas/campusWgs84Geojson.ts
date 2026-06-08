import { z } from "zod";
import { campusFeatureCategory } from "./campusGeojson";

// ─── Shared primitives ──────────────────────────────────────────

const positionSchema = z.tuple([z.number(), z.number()]);

// ─── Polygon Geometry (closed-ring validated) ───────────────────

const linearRingSchema = z.array(positionSchema).min(4);
const polygonCoordinatesSchema = z.array(linearRingSchema).min(1);

const polygonGeometrySchema = z
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

// ─── WGS84 Feature Properties (extends local with fid, id) ──────

export const campusWgs84FeaturePropertiesSchema = z.object({
  fid: z.number().optional(),
  id: z.string().optional(),
  name: z.string(),
  name_ko: z.string(),
  level: z.number(),
  level_id: z.string(),
  building_id: z.string(),
  category: campusFeatureCategory,
  interactive: z.boolean(),
  source: z.string(),
});

export type CampusWgs84FeatureProperties = z.infer<
  typeof campusWgs84FeaturePropertiesSchema
>;

// ─── WGS84 Feature ──────────────────────────────────────────────

export const campusWgs84FeatureSchema = z.object({
  type: z.literal("Feature"),
  geometry: polygonGeometrySchema,
  properties: campusWgs84FeaturePropertiesSchema,
});

export type CampusWgs84Feature = z.infer<typeof campusWgs84FeatureSchema>;

// ─── WGS84 Feature Collection ───────────────────────────────────

export const campusWgs84FeatureCollectionSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(campusWgs84FeatureSchema),
  metadata: z.object({
    coordinateSystem: z.literal("WGS84"),
  }),
});

export type CampusWgs84FeatureCollection = z.infer<
  typeof campusWgs84FeatureCollectionSchema
>;
