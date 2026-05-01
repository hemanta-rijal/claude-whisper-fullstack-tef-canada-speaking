import * as z from "zod"

export const loginSchema = z.object({
    email: z.email(),
    password: z.string().min(8),
});

export const registerSchema = z.object({
    email: z.email(),
    password: z.string().min(8),
    name: z.string().optional(),
});

export const forgotPasswordSchema = z.object({
    email: z.email(),
});

export const resetPasswordSchema = z.object({
    token: z.string().min(1),
    password: z.string().min(8),
});