import { pgTable, text, serial, timestamp, jsonb, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  messages: jsonb("messages").notNull().$type<ConversationMessage[]>(),
  voiceSettings: jsonb("voice_settings").notNull().default({
    ontological: "Charon",
    renaissance: "Puck",
    crisis: "Orus",
    operational: "Fenrir",
  }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const memoryContexts = pgTable("memory_contexts", {
  id: serial("id").primaryKey(),
  summary: text("summary").notNull(),
  topics: text("topics").array().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const memories = pgTable("memories", {
  id: serial("id").primaryKey(),
  text: text("text").notNull(),
  vector: real("vector").array().notNull(),
  category: text("category").notNull().default("general"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const userProfiles = pgTable("user_profiles", {
  id: serial("id").primaryKey(),
  coreProfile: jsonb("core_profile").notNull().default({}).$type<UserCoreProfile>(),
  livingPromptSummary: text("living_prompt_summary").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type UserCoreProfile = {
  name?: string;
  topics?: string[];
  interests?: string[];
  patterns?: string[];
  preferences?: string[];
  core_rules?: string[];
};

export type ExpertId = "ontological" | "renaissance" | "crisis" | "operational";

export const STOP_TOKENS: Record<ExpertId, string> = {
  ontological: "[ONTOLOGY_END]",
  renaissance: "[RENAISSANCE_END]",
  crisis: "[CRISIS_END]",
  operational: "[FOX_END]",
};

export type ConversationMessage = {
  id: string;
  role: "user" | ExpertId;
  content: string;
  timestamp: string;
  metaAgent?: string;
  isSafetyOverride?: boolean;
};

export const insertConversationSchema = createInsertSchema(conversations).omit({ id: true, createdAt: true, updatedAt: true });
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;

export const insertMemoryContextSchema = createInsertSchema(memoryContexts).omit({ id: true, createdAt: true });
export type MemoryContext = typeof memoryContexts.$inferSelect;
export type InsertMemoryContext = z.infer<typeof insertMemoryContextSchema>;

export const insertMemorySchema = createInsertSchema(memories).omit({ id: true, createdAt: true });
export type Memory = typeof memories.$inferSelect;
export type InsertMemory = z.infer<typeof insertMemorySchema>;

export const insertUserProfileSchema = createInsertSchema(userProfiles).omit({ id: true, createdAt: true, updatedAt: true });
export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;

export const chatRequestSchema = z.object({
  message: z.string(),
  conversationId: z.number().nullable().optional(),
  imageBase64: z.string().nullable().optional(),
  audioBase64: z.string().nullable().optional(),
  sessionId: z.string().optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const voiceSettingsSchema = z.object({
  ontological: z.string(),
  renaissance: z.string(),
  crisis: z.string(),
  operational: z.string(),
});

export const acquiredItems = pgTable("acquired_items", {
  id: serial("id").primaryKey(),
  item: text("item").notNull(),
  source: text("source").notNull().default("operational"),
  context: text("context").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAcquiredItemSchema = createInsertSchema(acquiredItems).omit({ id: true, createdAt: true });
export type AcquiredItem = typeof acquiredItems.$inferSelect;
export type InsertAcquiredItem = z.infer<typeof insertAcquiredItemSchema>;

export type MetaAgentId = ExpertId;

export interface MetaAgentInfo {
  id: MetaAgentId;
  name: string;
  nameHe: string;
  framework: string;
  color: string;
  icon: string;
  stopToken: string;
}
