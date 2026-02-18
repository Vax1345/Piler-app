import { db } from "./db";
import { conversations, memoryContexts, memories, userProfiles, acquiredItems, type Conversation, type InsertConversation, type MemoryContext, type InsertMemoryContext, type Memory, type InsertMemory, type UserProfile, type InsertUserProfile, type ConversationMessage, type AcquiredItem, type InsertAcquiredItem } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { encryptProfile, decryptProfile } from "./lib/profileCrypto";

export interface IStorage {
  createConversation(conv: InsertConversation): Promise<Conversation>;
  getConversation(id: number): Promise<Conversation | undefined>;
  updateConversationMessages(id: number, messages: ConversationMessage[]): Promise<void>;
  updateVoiceSettings(id: number, settings: any): Promise<void>;
  getAllConversations(): Promise<Conversation[]>;
  deleteConversation(id: number): Promise<void>;
  createMemoryContext(ctx: InsertMemoryContext): Promise<MemoryContext>;
  getRecentMemoryContexts(limit?: number): Promise<MemoryContext[]>;
  createMemory(mem: InsertMemory): Promise<Memory>;
  getAllMemories(): Promise<Memory[]>;
  getRecentMemories(limit?: number): Promise<Memory[]>;
  getUserProfile(): Promise<UserProfile | undefined>;
  upsertUserProfile(profile: Partial<InsertUserProfile>): Promise<UserProfile>;
  updateLivingPromptSummary(summary: string): Promise<void>;
  addAcquiredItem(item: InsertAcquiredItem): Promise<AcquiredItem>;
  getAcquiredItems(): Promise<AcquiredItem[]>;
  deleteAcquiredItem(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async createConversation(conv: InsertConversation): Promise<Conversation> {
    const [result] = await db.insert(conversations).values(conv).returning();
    return result;
  }

  async getConversation(id: number): Promise<Conversation | undefined> {
    const [result] = await db.select().from(conversations).where(eq(conversations.id, id));
    return result;
  }

  async updateConversationMessages(id: number, messages: ConversationMessage[]): Promise<void> {
    await db.update(conversations).set({ messages, updatedAt: new Date() }).where(eq(conversations.id, id));
  }

  async updateVoiceSettings(id: number, settings: any): Promise<void> {
    await db.update(conversations).set({ voiceSettings: settings, updatedAt: new Date() }).where(eq(conversations.id, id));
  }

  async getAllConversations(): Promise<Conversation[]> {
    return db.select().from(conversations).orderBy(desc(conversations.updatedAt));
  }

  async deleteConversation(id: number): Promise<void> {
    await db.delete(conversations).where(eq(conversations.id, id));
  }

  async createMemoryContext(ctx: InsertMemoryContext): Promise<MemoryContext> {
    const [result] = await db.insert(memoryContexts).values(ctx).returning();
    return result;
  }

  async getRecentMemoryContexts(limit = 10): Promise<MemoryContext[]> {
    return db.select().from(memoryContexts).orderBy(desc(memoryContexts.createdAt)).limit(limit);
  }

  async createMemory(mem: InsertMemory): Promise<Memory> {
    const [result] = await db.insert(memories).values(mem).returning();
    return result;
  }

  async getAllMemories(): Promise<Memory[]> {
    return db.select().from(memories).orderBy(desc(memories.createdAt));
  }

  async getRecentMemories(limit = 50): Promise<Memory[]> {
    return db.select().from(memories).orderBy(desc(memories.createdAt)).limit(limit);
  }

  async getUserProfile(): Promise<UserProfile | undefined> {
    const [result] = await db.select().from(userProfiles).limit(1);
    if (result && result.coreProfile) {
      try {
        const profileStr = typeof result.coreProfile === "string" ? result.coreProfile : JSON.stringify(result.coreProfile);
        result.coreProfile = decryptProfile(profileStr);
      } catch {
      }
    }
    return result;
  }

  async upsertUserProfile(profile: Partial<InsertUserProfile>): Promise<UserProfile> {
    const existing = await this.getRawUserProfile();
    const encryptedProfile = profile.coreProfile !== undefined
      ? encryptProfile(profile.coreProfile as Record<string, any>)
      : undefined;

    if (existing) {
      const updateData: any = { updatedAt: new Date() };
      if (encryptedProfile !== undefined) updateData.coreProfile = encryptedProfile;
      if (profile.livingPromptSummary !== undefined) updateData.livingPromptSummary = profile.livingPromptSummary;
      const [result] = await db.update(userProfiles).set(updateData).where(eq(userProfiles.id, existing.id)).returning();
      if (result && result.coreProfile) {
        try {
          const profileStr = typeof result.coreProfile === "string" ? result.coreProfile : JSON.stringify(result.coreProfile);
          result.coreProfile = decryptProfile(profileStr);
        } catch {}
      }
      return result;
    }
    const [result] = await db.insert(userProfiles).values({
      coreProfile: encryptedProfile || encryptProfile({}),
      livingPromptSummary: profile.livingPromptSummary || "",
    }).returning();
    if (result && result.coreProfile) {
      try {
        const profileStr = typeof result.coreProfile === "string" ? result.coreProfile : JSON.stringify(result.coreProfile);
        result.coreProfile = decryptProfile(profileStr);
      } catch {}
    }
    return result;
  }

  private async getRawUserProfile(): Promise<UserProfile | undefined> {
    const [result] = await db.select().from(userProfiles).limit(1);
    return result;
  }

  async updateLivingPromptSummary(summary: string): Promise<void> {
    const existing = await this.getRawUserProfile();
    if (existing) {
      await db.update(userProfiles).set({ livingPromptSummary: summary, updatedAt: new Date() }).where(eq(userProfiles.id, existing.id));
    } else {
      await db.insert(userProfiles).values({ coreProfile: encryptProfile({}), livingPromptSummary: summary });
    }
  }

  async addAcquiredItem(item: InsertAcquiredItem): Promise<AcquiredItem> {
    const [result] = await db.insert(acquiredItems).values(item).returning();
    return result;
  }

  async getAcquiredItems(): Promise<AcquiredItem[]> {
    return db.select().from(acquiredItems).orderBy(desc(acquiredItems.createdAt));
  }

  async deleteAcquiredItem(id: number): Promise<void> {
    await db.delete(acquiredItems).where(eq(acquiredItems.id, id));
  }
}

export const storage = new DatabaseStorage();
