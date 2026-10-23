// Fonction Edge « student-access » — espace élèves du Cartable.
// Les élèves n'ont pas de compte : ils présentent le code de leur classe.
// La fonction compare le SHA-256 du code à classes.code_hash, puis lit ou écrit
// avec la clé service_role (disponible uniquement ici, jamais dans le site).
//
// Déploiement : voir DEPLOIEMENT.md, étape 3. « Verify JWT » doit être DÉSACTIVÉ.
// Variable facultative : ALLOWED_ORIGIN (ex. https://VOTRE-NOM.github.io)
// pour n'accepter que les appels venant de votre site.
import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN") ?? "*";
const cors = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Même normalisation que le site : espaces retirés, majuscules.
const normalize = (v: string) => v.replace(/\s+/g, "").toUpperCase();
async function sha256(value: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalize(value)));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  try {
    const body = await req.json();
    const code = body?.code;
    if (typeof code !== "string" || normalize(code).length < 8 || normalize(code).length > 40) {
      return json({ error: "Code invalide." }, 400);
    }

    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("Configuration serveur manquante.");
    const admin = createClient(url, key, { auth: { persistSession: false } });

    const { data: cls, error: ce } = await admin
      .from("classes").select("id,name").eq("code_hash", await sha256(code)).maybeSingle();
    if (ce) throw ce;
    if (!cls) return json({ error: "Code inconnu. Vérifiez le code auprès du professeur." }, 401);

    const studentName = clean(body.student_name, 120) || "Élève";

    if (body.action === "question") {
      const question = clean(body.question, 4000);
      if (!question) return json({ error: "La question est vide ou trop longue." }, 400);
      const { error } = await admin.from("student_questions").insert({ class_id: cls.id, student_name: studentName, question });
      if (error) throw error;
      return json({ ok: true });
    }

    if (body.action === "submission") {
      const title = clean(body.title, 200);
      const answer = clean(body.answer, 12000);
      if (!title || !answer) return json({ error: "Titre ou réponse invalide." }, 400);
      const { error } = await admin.from("submissions").insert({ class_id: cls.id, student_name: studentName, title, answer });
      if (error) throw error;
      return json({ ok: true });
    }

    // Consultation : documents publiés + cahier de texte.
    const { data: documents, error: de } = await admin
      .from("materials").select("title,kind,body,url,due_date,created_at")
      .eq("class_id", cls.id).eq("published", true).order("created_at", { ascending: false });
    if (de) throw de;
    const { data: lessons } = await admin
      .from("lessons").select("lesson_date,title,content,homework")
      .eq("class_id", cls.id).order("lesson_date", { ascending: false }).limit(30);

    return json({ className: cls.name, documents: documents ?? [], lessons: lessons ?? [] });
  } catch (_e) {
    return json({ error: "Service temporairement indisponible." }, 500);
  }
});
