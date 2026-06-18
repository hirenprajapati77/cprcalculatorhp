import { z } from 'zod';

export const CPRInputSchema = z.object({
  symbol: z.string().optional(),
  high: z.number({ message: 'High is required and must be a number' })
    .positive('High must be positive')
    .finite('High must be a finite number'),
  low: z.number({ message: 'Low is required and must be a number' })
    .positive('Low must be positive')
    .finite('Low must be a finite number'),
  close: z.number({ message: 'Close is required and must be a number' })
    .positive('Close must be positive')
    .finite('Close must be a finite number'),
}).superRefine(({ high, low, close }, ctx) => {
  if (high <= low) {
    ctx.addIssue({
      code: 'custom',
      path: ['high'],
      message: 'High must be greater than Low',
    });
  }
  if (close > high || close < low) {
    ctx.addIssue({
      code: 'custom',
      path: ['close'],
      message: 'Close must be within High-Low range',
    });
  }
});

export type CPRInputSchemaType = z.infer<typeof CPRInputSchema>;
