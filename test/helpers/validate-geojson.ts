import { z } from "zod";

const featureSchema = z.object({
  type: z.literal("Feature"),
  geometry: z.record(z.unknown()),
  properties: z.record(z.unknown()),
});

export const featureCollectionSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(featureSchema).min(1),
});

export function validateGeoJson(input: unknown) {
  return featureCollectionSchema.safeParse(input);
}
