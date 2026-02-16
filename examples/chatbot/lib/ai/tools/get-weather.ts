import { tool } from "ai";
import { z } from "zod";

async function safeParseJson(response: Response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

async function geocodeCity(
  city: string
): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const response = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`
    );

    if (!response.ok) {
      return null;
    }

    const data = await safeParseJson(response);

    if (!data || typeof data !== "object") {
      return null;
    }

    if (
      !("results" in data) ||
      !Array.isArray((data as { results?: unknown }).results) ||
      (data as { results: unknown[] }).results.length === 0
    ) {
      return null;
    }

    const result = (data as { results: Array<Record<string, unknown>> })
      .results[0];

    if (
      typeof result.latitude !== "number" ||
      typeof result.longitude !== "number"
    ) {
      return null;
    }

    return {
      latitude: result.latitude,
      longitude: result.longitude,
    };
  } catch {
    return null;
  }
}

export const getWeather = tool({
  description:
    "Get the current weather at a location. You can provide either coordinates or a city name.",
  inputSchema: z.object({
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    city: z
      .string()
      .describe("City name (e.g., 'San Francisco', 'New York', 'London')")
      .optional(),
  }),
  needsApproval: true,
  execute: async (input) => {
    let latitude: number;
    let longitude: number;

    if (input.city) {
      const coords = await geocodeCity(input.city);
      if (!coords) {
        return {
          error: `Could not find coordinates for "${input.city}". Please check the city name.`,
        };
      }
      latitude = coords.latitude;
      longitude = coords.longitude;
    } else if (input.latitude !== undefined && input.longitude !== undefined) {
      latitude = input.latitude;
      longitude = input.longitude;
    } else {
      return {
        error:
          "Please provide either a city name or both latitude and longitude coordinates.",
      };
    }

    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m&hourly=temperature_2m&daily=sunrise,sunset&timezone=auto`
    );

    const weatherData = (await safeParseJson(response)) as
      | Record<string, unknown>
      | null;

    if (!weatherData || typeof weatherData !== "object") {
      return {
        error: "Weather API returned an empty or invalid response.",
      };
    }

    if ("city" in input) {
      (weatherData as { cityName?: string }).cityName = input.city;
    }

    return weatherData as any;
  },
});
