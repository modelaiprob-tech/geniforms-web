import type { APIContext } from 'astro';

const GEMINI_KEY   = import.meta.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.5-flash';

// ── Types ─────────────────────────────────────────────────────────────────────

interface QuestionType {
  on: boolean;
  count: number;
}

interface Question {
  pregunta: string;
  tipo: 'abcd' | 'vf' | 'short';
  opciones?: string[];
  correcta?: string;
}

// ── Gemini ────────────────────────────────────────────────────────────────────

async function callGemini(params: {
  mode: string;
  title: string;
  subject?: string;
  context?: string;
  intro?: string;
  text?: string;
  difficulty: string;
  types: Record<string, QuestionType>;
}): Promise<Question[]> {
  const { mode, title, subject, context, intro, text, difficulty, types } = params;

  const typeLines: string[] = [];
  if (types.multiple_choice?.on && types.multiple_choice.count > 0)
    typeLines.push(`- ${types.multiple_choice.count} preguntas de opción múltiple (tipo "abcd", 4 opciones A/B/C/D)`);
  if (types.true_false?.on && types.true_false.count > 0)
    typeLines.push(`- ${types.true_false.count} preguntas de verdadero/falso (tipo "vf")`);
  if (types.short_answer?.on && types.short_answer.count > 0)
    typeLines.push(`- ${types.short_answer.count} preguntas de respuesta corta (tipo "short")`);
  if (types.checkboxes?.on && types.checkboxes.count > 0)
    typeLines.push(`- ${types.checkboxes.count} preguntas de selección múltiple (tipo "abcd", 4 opciones)`);

  const diffMap: Record<string, string> = { facil: 'fácil', medio: 'media', dificil: 'difícil', easy: 'fácil', medium: 'media', hard: 'difícil' };
  const diffLabel = diffMap[difficulty] ?? 'media';

  let prompt: string;

  if (mode === 'format') {
    prompt = `Extrae y convierte a JSON las preguntas del siguiente texto. No inventes preguntas nuevas, solo formatea las que ya existen.

Texto:
${text}

Devuelve ÚNICAMENTE un array JSON válido, sin texto adicional, sin bloques markdown.
Formato:
[
  {"pregunta": "...", "tipo": "abcd", "opciones": ["A) ...", "B) ...", "C) ...", "D) ..."], "correcta": "A"},
  {"pregunta": "...", "tipo": "vf", "opciones": ["Verdadero", "Falso"], "correcta": "Verdadero"},
  {"pregunta": "...", "tipo": "short"}
]`;
  } else {
    prompt = `Eres un experto en educación. Genera un cuestionario en español.
Tema: ${title}${subject ? `\nAsignatura: ${subject}` : ''}${context ? `\nContexto: ${context}` : ''}
Dificultad: ${diffLabel}
Tipos de preguntas:
${typeLines.join('\n')}
${intro ? `\nIntroducción del formulario: ${intro}` : ''}
${text ? `\nMaterial de referencia:\n${text}` : ''}

Devuelve ÚNICAMENTE un array JSON válido, sin texto adicional, sin bloques markdown.
Formato:
[
  {"pregunta": "...", "tipo": "abcd", "opciones": ["A) ...", "B) ...", "C) ...", "D) ..."], "correcta": "A"},
  {"pregunta": "...", "tipo": "vf", "opciones": ["Verdadero", "Falso"], "correcta": "Verdadero"},
  {"pregunta": "...", "tipo": "short"}
]`;
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, responseMimeType: 'application/json' }
      })
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]';
  const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim();
  return JSON.parse(cleaned) as Question[];
}

// ── Google Forms ──────────────────────────────────────────────────────────────

async function createGoogleForm(title: string, questions: Question[], token: string) {
  // 1. Create empty form
  const createRes = await fetch('https://forms.googleapis.com/v1/forms', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ info: { title } })
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Forms create ${createRes.status}: ${err}`);
  }

  const form = await createRes.json();
  const formId: string = form.formId;

  // 2. Add questions via batchUpdate
  const requests = questions.map((q, i) => {
    if (q.tipo === 'short') {
      return {
        createItem: {
          item: {
            title: q.pregunta,
            questionItem: { question: { required: false, textQuestion: { paragraph: false } } }
          },
          location: { index: i }
        }
      };
    }
    const options = (q.opciones ?? []).map(o => ({ value: o }));
    return {
      createItem: {
        item: {
          title: q.pregunta,
          questionItem: {
            question: { required: true, choiceQuestion: { type: 'RADIO', options, shuffle: false } }
          }
        },
        location: { index: i }
      }
    };
  });

  const batchRes = await fetch(`https://forms.googleapis.com/v1/forms/${formId}:batchUpdate`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests })
  });

  if (!batchRes.ok) {
    const err = await batchRes.text();
    throw new Error(`Forms batchUpdate ${batchRes.status}: ${err}`);
  }

  return form;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST({ request }: APIContext) {
  try {
    const body = await request.json();
    const { mode, title, subject, context, intro, text, difficulty, types, googleToken } = body;

    if (!googleToken) {
      return new Response(JSON.stringify({ error: 'No Google token — inicia sesión' }), { status: 401 });
    }
    if (!GEMINI_KEY) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY no configurada' }), { status: 500 });
    }

    const questions = await callGemini({ mode, title, subject, context, intro, text, difficulty, types });

    if (!questions.length) {
      return new Response(JSON.stringify({ error: 'No se generaron preguntas' }), { status: 422 });
    }

    const form = await createGoogleForm(title || 'Cuestionario', questions, googleToken);

    return new Response(JSON.stringify({
      title:   title || 'Cuestionario',
      count:   questions.length,
      formUrl: form.responderUri,
      editUrl: `https://docs.google.com/forms/d/${form.formId}/edit`,
      formId:  form.formId
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error interno';
    console.error('[generate]', msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
}
