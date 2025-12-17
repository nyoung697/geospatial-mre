import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  meetings: defineTable({
    name: v.string(),
    startTime: v.number(),
    weekday: v.number(),
    point: v.object({
      latitude: v.float64(),
      longitude: v.float64()
    })
  })
})