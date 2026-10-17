import { z } from "zod";

const text = z.string().trim().min(1).max(200);
// Dates arrive as YYYY-MM-DD from `<input type="date">`.
const isoDate = z.iso.date();

// Each form kind keeps only the fields it uses; other fields are dropped.
const valuesByKind = {
  client: z.object({
    title: text,
    contact: text,
    email: z.email().max(200),
  }),
  project: z.object({ title: text, client: text, due: isoDate }),
  invoice: z.object({
    title: text,
    client: text,
    amount: z.number().positive().max(1e10),
    due: isoDate,
  }),
  proposal: z.object({ title: text, client: text }),
  contract: z.object({ title: text, client: text }),
  form: z.object({ title: text, client: text }),
};

export type RecordInput = {
  [Kind in keyof typeof valuesByKind]: {
    kind: Kind;
    values: z.infer<(typeof valuesByKind)[Kind]>;
  };
}[keyof typeof valuesByKind];

export const recordInput = z.discriminatedUnion(
  "kind",
  Object.entries(valuesByKind).map(([kind, values]) =>
    z.object({ kind: z.literal(kind), values }),
  ) as unknown as [z.ZodObject, ...z.ZodObject[]],
) as unknown as z.ZodType<RecordInput>;

export const timeInput = z.object({
  project: text,
  // A session longer than a day is almost certainly a forgotten timer.
  seconds: z.number().int().positive().max(86_400),
});
