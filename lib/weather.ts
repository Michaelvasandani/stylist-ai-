// Open-Meteo: free, no key. Geocode a place name, then summarise the next ~18 hours.
type Geo = { name: string; latitude: number; longitude: number; admin1?: string; country_code?: string };

export type WeatherSummary = {
  place: string;
  now: { tempF: number; windMph: number; description: string };
  next18h: { lowF: number; highF: number; maxWindMph: number; maxRainChance: number };
  evening?: { tempF: number; windMph: number; rainChance: number }; // 6–10pm local, if still ahead
};

// WMO weather codes → words (just the ones that change what you'd wear).
function describe(code: number) {
  if (code === 0) return "clear";
  if (code <= 3) return "partly cloudy";
  if (code <= 48) return "foggy";
  if (code <= 67) return "rainy";
  if (code <= 77) return "snowy";
  if (code <= 82) return "showers";
  return "stormy";
}

const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length));

export async function getWeather(location: string): Promise<WeatherSummary> {
  const geoRes = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&name=${encodeURIComponent(location)}`,
  );
  const geo: Geo | undefined = (await geoRes.json()).results?.[0];
  if (!geo) throw new Error(`Couldn't find a place called "${location}".`);

  const params = new URLSearchParams({
    latitude: String(geo.latitude),
    longitude: String(geo.longitude),
    current: "temperature_2m,wind_speed_10m,weather_code",
    hourly: "temperature_2m,precipitation_probability,wind_speed_10m",
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    forecast_days: "2",
    timezone: "auto",
  });
  const w = await (await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)).json();

  // Hourly times are local ("2026-10-14T18:00"); start from the current hour.
  const nowHour = (w.current.time as string).slice(0, 13);
  const start = Math.max(0, (w.hourly.time as string[]).findIndex((t) => t.startsWith(nowHour)));
  const hours = (w.hourly.time as string[]).slice(start, start + 18).map((t, i) => ({
    hour: Number(t.slice(11, 13)),
    temp: w.hourly.temperature_2m[start + i] as number,
    wind: w.hourly.wind_speed_10m[start + i] as number,
    rain: (w.hourly.precipitation_probability[start + i] as number) ?? 0,
  }));
  const evening = hours.slice(0, 12).filter((h) => h.hour >= 18 && h.hour <= 22);

  return {
    place: [geo.name, geo.admin1].filter(Boolean).join(", "),
    now: {
      tempF: Math.round(w.current.temperature_2m),
      windMph: Math.round(w.current.wind_speed_10m),
      description: describe(w.current.weather_code),
    },
    next18h: {
      lowF: Math.round(Math.min(...hours.map((h) => h.temp))),
      highF: Math.round(Math.max(...hours.map((h) => h.temp))),
      maxWindMph: Math.round(Math.max(...hours.map((h) => h.wind))),
      maxRainChance: Math.max(...hours.map((h) => h.rain)),
    },
    ...(evening.length && {
      evening: {
        tempF: avg(evening.map((h) => h.temp)),
        windMph: avg(evening.map((h) => h.wind)),
        rainChance: Math.max(...evening.map((h) => h.rain)),
      },
    }),
  };
}
