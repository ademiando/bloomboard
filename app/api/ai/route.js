import OpenAI from "openai";
import { NextResponse } from "next/server";
export async function POST(req){
  const body = await req.json();
  const prompt = body?.prompt||'';
  const key = process.env.OPENAI_API_KEY;
  if(!key) return NextResponse.json({ message: 'Missing OPENAI_API_KEY' }, { status: 500 });
  const client = new OpenAI({ apiKey: key });
  try{
    const res = await client.chat.completions.create({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', messages: [{ role:'system', content: 'You are an expert trading developer.' }, { role:'user', content: prompt }], temperature: 0.2 });
    const message = res.choices[0].message.content;
    const code = (message.match(/```[a-zA-Z]*\n([\s\S]*?)```/)||[])[1] || '';
    return NextResponse.json({ message, code });
  }catch(e){
    return NextResponse.json({ message: 'AI error' }, { status: 500 });
  }
}
