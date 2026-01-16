import { serve } from "std/http/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { user_id, photo_url } = await req.json();

    if (!user_id || !photo_url) {
      throw new Error("Missing user_id or photo_url");
    }

    const GOOGLE_API_KEY = Deno.env.get("GOOGLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // 1. VERIFICAR LÍMITES DE ESCANEO
    const { data: profile } = await supabase.from("profiles").select(
      "subscription_status, scan_limit_daily",
    ).eq("id", user_id).single();

    if (profile?.subscription_status !== "pro") {
      const today = new Date().toISOString().split("T")[0];
      const { count } = await supabase
        .from("usage_logs")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user_id)
        .eq("action_type", "scan")
        .gte("created_at", today);

      const limit = profile?.scan_limit_daily || 3;
      if (count && count >= limit) {
        return new Response(
          JSON.stringify({
            status: "error",
            error:
              "Has alcanzado tu límite de escaneos diarios. ¡Pásate a PRO para escaneos ilimitados!",
            is_limit_reached: true,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    // 2. PROCESAR IMAGEN Y LLAMAR A GEMINI
    const imageResp = await fetch(photo_url);
    const imageArrayBuffer = await imageResp.arrayBuffer();
    const imageBase64 = btoa(
      new Uint8Array(imageArrayBuffer).reduce(
        (data, byte) => data + String.fromCharCode(byte),
        "",
      ),
    );

    const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY!);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            identified: { type: SchemaType.BOOLEAN },
            reason: { type: SchemaType.STRING },
            brand: { type: SchemaType.STRING },
            name: { type: SchemaType.STRING },
            concentration: { type: SchemaType.STRING },
            olfactory_family: { type: SchemaType.STRING },
            notes: {
              type: SchemaType.OBJECT,
              properties: {
                top: {
                  type: SchemaType.ARRAY,
                  items: { type: SchemaType.STRING },
                },
                heart: {
                  type: SchemaType.ARRAY,
                  items: { type: SchemaType.STRING },
                },
                base: {
                  type: SchemaType.ARRAY,
                  items: { type: SchemaType.STRING },
                },
              },
            },
            usage: {
              type: SchemaType.OBJECT,
              properties: {
                occasions: {
                  type: SchemaType.ARRAY,
                  items: { type: SchemaType.STRING },
                },
                season: {
                  type: SchemaType.ARRAY,
                  items: { type: SchemaType.STRING },
                },
                time_of_day: { type: SchemaType.STRING },
              },
            },
            description: { type: SchemaType.STRING },
          },
          required: ["identified"],
        },
      },
    });

    const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));
    let result;
    let attempts = 0;
    while (attempts < 3) {
      try {
        attempts++;
        result = await model.generateContent([
          `Eres un Sommelier de Perfumes de ÉLITE. Misión: Análisis MAGISTRAL.
          1. ESTRATEGIA HÍBRIDA: Usa Google Search para las notas, pero si falla o hay bloqueo, USA TU CONOCIMIENTO INTERNO. PROHIBIDO el "N/A".
          2. PIRÁMIDE COMPLETA: Salida, Corazón y Fondo son obligatorios.
          3. DESCRIPCIÓN INMERSIVA: Mínimo 250 caracteres detallando la evolución del aroma (apertura, secado y fondo).
          4. USO Y CLIMA: Evalúa Gym, Oficina, Citas y clima.
          5. RESPUESTA: JSON en ESPAÑOL siguiendo el esquema estrictamente.`,
          { inlineData: { data: imageBase64, mimeType: "image/jpeg" } },
        ]);
        break;
      } catch (e: unknown) {
        if (e instanceof Error && e.message?.includes("429") && attempts < 3) {
          console.log(
            `Error 429 detectado. Reintentando en ${2000 * attempts}ms...`,
          );
          await delay(2000 * attempts);
          continue;
        }
        throw e;
      }
    }

    if (!result) {
      throw new Error("No se pudo obtener respuesta de la IA.");
    }

    const textResponse = result.response.text();

    // Limpieza y extracción robusta de JSON
    let jsonString = textResponse;
    if (jsonString.includes("```")) {
      const matches = jsonString.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (matches && matches[1]) {
        jsonString = matches[1];
      } else {
        const start = jsonString.indexOf("{");
        const end = jsonString.lastIndexOf("}");
        if (start !== -1 && end !== -1) {
          jsonString = jsonString.substring(start, end + 1);
        }
      }
    } else {
      const start = jsonString.indexOf("{");
      const end = jsonString.lastIndexOf("}");
      if (start !== -1 && end !== -1) {
        jsonString = jsonString.substring(start, end + 1);
      }
    }

    const ai_data = JSON.parse(jsonString.trim());

    if (ai_data.identified) {
      // 3. REGISTRAR EN MASTER DB Y LOGS
      await supabase.from("master_perfumes").upsert({
        brand: ai_data.brand,
        name: ai_data.name,
        description: ai_data.description,
        notes: ai_data.notes,
        usage: ai_data.usage,
        image_url: photo_url,
        full_ai_data: ai_data,
      }, { onConflict: "brand, name" });

      // Registrar log de uso
      await supabase.from("usage_logs").insert({
        user_id,
        action_type: "scan",
      });

      // 4. GUARDAR EN COLECCIÓN DEL USUARIO
      await supabase.from("user_collections").insert({
        user_id,
        photo_url,
        ai_data,
      });
    }

    return new Response(
      JSON.stringify({ status: "success", data: ai_data }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const err = error as Error;
    console.error("Critical Error:", err);
    return new Response(
      JSON.stringify({ status: "error", error: err.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
