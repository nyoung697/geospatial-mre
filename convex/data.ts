import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { GeospatialIndex, point } from '@convex-dev/geospatial'
import { components } from "./_generated/api";
import { Id } from './_generated/dataModel';

const geospatial = new GeospatialIndex(components.geospatial)

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

// tiny, fast haversine (meters)
function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const R = 6371000; // m
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat + Math.cos(la1) * Math.cos(la2) * sinDLng * sinDLng;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}