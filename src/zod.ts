import { ZodType } from "zod";

/**
 * This type is used instead of z.ZodTypeAny
 */
export type ZodTypeUnknown = ZodType<unknown>;
