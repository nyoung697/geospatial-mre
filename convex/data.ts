import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { GeospatialIndex, point } from '@convex-dev/geospatial'
import { components } from "./_generated/api";
import { Id } from './_generated/dataModel';

const geospatial = new GeospatialIndex(components.geospatial)

const data = [
  {
    name: "Miracles",
    point: {latitude: 51.0832877,longitude: -114.1278038},
    startTime: 720,
    weekday: 2
  },
  {
    name: "AMNA",
    point: {latitude: 51.02723,longitude: -113.9928005},
    startTime: 480,
    weekday: 3
  },
  {
    name: "Courage",
    point: {latitude: 51.0117555,longitude: -114.0837796},
    startTime: 1140,
    weekday: 3
  },
  {
    name: "Stepping",
    point: { latitude: 50.95648, longitude: -114.0862 },
    startTime: 1140,
    weekday: 3
  },
]

export const loadData = mutation({
  handler: async (ctx) => {
    for (const item of data) {
      const meetingId = await ctx.db.insert('meetings', item)
      await geospatial.insert(ctx, meetingId, item.point, { weekday: item.weekday }, item.startTime)
    }
  }
})

export const insert = mutation({
  args: {
    name: v.string(),
    startTime: v.number(),
    weekday: v.number(),
    point: v.object({
      latitude: v.float64(),
      longitude: v.float64()
    })
  },
  handler: async (ctx, args) => {
    //
    const meetingId = await ctx.db.insert('meetings', args)
    await geospatial.insert(ctx, meetingId, args.point, { weekday: args.weekday }, args.startTime)
  }
})

type GeospatialResults = Awaited<
  ReturnType<(typeof geospatial)["query"]>
>["results"];

export const get = query({
  args: {
    point: point,
    distance: v.number(),
    weekdays: v.array(v.number()),
    limit: v.optional(v.number()),
    timeFilter: v.object({
      start: v.number(),
      end: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    const {
      point,
      distance,
      weekdays,
      limit = 150,
      timeFilter,
    } = args;
    const maxDistance = Math.min(distance, 50_000); // keep a sane cap

    const result = await geospatial.nearest(ctx, {
      point,
      limit,
      filter: (x) =>
        x
          .gte("sortKey", timeFilter.start)
          .lt("sortKey", timeFilter.end)
          .in("weekday", weekdays),
      maxDistance,
    });

    // Join to meeting docs
    const out = (
      await Promise.all(
        result.map(async (item) => {
          const meeting = await ctx.db.get(item.key as Id<"meetings">);
          if (!meeting) {
            throw new Error(`Invalid Meeting Id: ${item.key}`)
          }

          return {
            _id: meeting._id,
            name: meeting.name,
            weekday: meeting.weekday,
            startTime: meeting.startTime,
            lat: item.coordinates.latitude,
            lng: item.coordinates.longitude,
            distance: item.distance,
          };
        }),
      )
    )

    return out;
  },
})