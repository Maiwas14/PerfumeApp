import { serve } from "std/http/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";

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
    const { user_id, perfume_data, collection_data, question, user_context } =
      await req.json();

    if (!question || (!perfume_data && !collection_data)) {
      throw new Error("Faltan datos (perfume o colección) o la pregunta.");
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const GOOGLE_API_KEY = Deno.env.get("GOOGLE_API_KEY") ||
      "AIzaSyBTQ7UZ0WUV3ljnH2SKPzUL0gqAlyY3OF0";

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // 1. VERIFICAR SUSCRIPCIÓN Y LÍMITES
    if (user_id) {
      const { data: profile } = await supabase.from("profiles").select(
        "subscription_status",
      ).eq("id", user_id).single();

      if (profile?.subscription_status !== "pro") {
        // Si no es pro, verificamos si ya usó su consulta gratuita (ej: 1 al día)
        const today = new Date().toISOString().split("T")[0];
        const { count } = await supabase
          .from("usage_logs")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user_id)
          .eq("action_type", "expert_consult")
          .gte("created_at", today);

        if (count && count >= 1) {
          return new Response(
            JSON.stringify({
              answer:
                "Has alcanzado tu límite de consultas gratuitas por hoy. ¡Actualiza a PRO para consultas ilimitadas y consejos avanzados!",
              is_limit_reached: true,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
    }

    // 2. CONSULTA A GEMINI
    const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    let contextData = "";
    if (perfume_data) {
      contextData = `
        DATOS DEL PERFUME ESPECÍFICO:
        - Marca: ${perfume_data.brand}
        - Nombre: ${perfume_data.name}
        - Notas: ${JSON.stringify(perfume_data.notes)}
        - Familia: ${perfume_data.olfactory_family}
      `;
    } else if (collection_data && Array.isArray(collection_data)) {
      contextData = `
        DATOS DE LA COLECCIÓN DEL USUARIO (${collection_data.length} perfumes):
        ${
        collection_data.map((p: any, i: number) => `
          ${
          i + 1
        }. ${p.ai_data?.brand} - ${p.ai_data?.name} (${p.ai_data?.olfactory_family})
        `).join("\n")
      }
      `;
    }

    const prompt = `
      Eres un experto Sommelier de Perfumes de lujo. 
      ${contextData}
      
      CONTEXTO DEL USUARIO:
      ${user_context || "No especificado"}

      PREGUNTA DEL USUARIO:
      "${question}"

      INSTRUCCIONES:
      1. Responde de forma elegante, profesional y útil.
      2. Si te preguntan por la colección completa, ayuda al usuario a elegir entre sus opciones basándote en la ocasión o clima que mencione.
      3. Da consejos específicos basados en la química del perfume.
      4. Si te preguntan por "dupes" de un perfume, busca otros perfumes arabes, nichos o diseñadores que tengan notas similares.
      
      RETORNA TU RESPUESTA EN ESTE FORMATO JSON:
      {
        "answer": "Tu respuesta concisa y profesional aquí"
      }
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    let resultData;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      resultData = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch (_e) {
      resultData = {
        answer: text.replace(/```json/g, "").replace(/```/g, "").trim(),
      };
    }

    // 3. REGISTRAR USO
    if (user_id) {
      await supabase.from("usage_logs").insert({
        user_id,
        action_type: "expert_consult",
      });
    }

    return new Response(
      JSON.stringify(resultData),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const err = error as Error;
    console.error("CRITICAL ERROR en consult-perfume:", err.message);
    return new Response(
      JSON.stringify({ status: "error", error: err.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
