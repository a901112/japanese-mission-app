import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
const outDir = path.join(process.cwd(), 'data', 'kotoba');
const grammarFiles = [
  ['N5','https://raw.githubusercontent.com/tristcoil/hanabira.org-japanese-content/main/grammar_json/grammar_ja_N5_full_alphabetical_0001.json'],
  ['N4','https://raw.githubusercontent.com/tristcoil/hanabira.org-japanese-content/main/grammar_json/grammar_ja_N4_full_alphabetical_0001.json'],
  ['N3','https://raw.githubusercontent.com/tristcoil/hanabira.org-japanese-content/main/grammar_json/grammar_ja_N3_full_alphabetical_0001.json'],
  ['N2','https://raw.githubusercontent.com/tristcoil/hanabira.org-japanese-content/main/grammar_json/grammar_ja_N2_full_alphabetical_0001.json'],
  ['N1','https://raw.githubusercontent.com/tristcoil/hanabira.org-japanese-content/main/grammar_json/grammar_ja_N1_full_alphabetical_0001.json']
];
function get(url){return new Promise((resolve,reject)=>https.get(url,{headers:{'User-Agent':'kotoba-trip-builder'}},r=>{if(r.statusCode<200||r.statusCode>=300){reject(Error(`HTTP ${r.statusCode} ${url}`));return;}let d='';r.setEncoding('utf8');r.on('data',c=>d+=c);r.on('end',()=>resolve(JSON.parse(d)));}).on('error',reject));}
const ch=(text,zh,sense,correct,reason)=>({text,zh,sense,correct,reason});
const slug=s=>String(s).toLowerCase().replace(/[^a-z0-9一-龥ぁ-んァ-ンー]+/g,'-').replace(/^-|-$/g,'').slice(0,48)||'grammar';
function shuffleStable(items,seed){return items.map((value,index)=>({value,sort:((seed+3)*(index+11)*9301)%9973})).sort((a,b)=>a.sort-b.sort).map(x=>x.value)}
function choices(pool,right,seed){const others=pool.filter(x=>x.jp!==right.jp),picked=[];for(let off=1;picked.length<3&&off<others.length+8;off++){const c=others[(seed*7+off*13)%others.length];if(c&&!picked.some(x=>x.jp===c.jp))picked.push(c)}return shuffleStable([ch(right.jp,right.en,right.title,true,`${right.title}：${right.short}`),...picked.map(x=>ch(x.jp,x.en,x.title,false,`這句屬於「${x.title}」，意思和題目不同。`))],seed)}
const scenes=[];
for (const [level,url] of grammarFiles) {
  const grammar=await get(url);
  const examples=[];
  grammar.forEach((point,pointIndex)=>(point.examples||[]).forEach((ex,exampleIndex)=>{if(ex.jp&&ex.en)examples.push({level,jp:ex.jp,en:ex.en,title:point.title,short:point.short_explanation||point.formation||'',formation:point.formation||'',pointIndex,exampleIndex})}));
  const seen=new Set();
  const unique=examples.filter(x=>{const k=`${x.jp}|${x.en}`;if(seen.has(k))return false;seen.add(k);return true;});
  const cards=unique.map((x,i)=>({id:`grammar-${level}-${String(i+1).padStart(4,'0')}`,scene_id:`grammar-${level}`,type:'open-grammar',prompt:`英文意思：${x.en}`,answer:x.jp,answer_zh:x.en,choices:choices(unique,x,i),explanation:`${x.title}${x.formation?`｜${x.formation}`:''}｜${x.short}`,family:`grammar_${level}_${slug(x.title)}`,audio:i%3===0,source:'Hanabira Japanese Content',license:'Creative Commons, attribution required',source_url:url}));
  scenes.push({id:`grammar-${level}`,icon:level.replace('N',''),title:`${level} 文法例句`,copy:`Hanabira 開放內容，${cards.length} 題不重複例句。`,memory:'先理解意思，再辨認自然日文。來源題句保留出處，不硬湊題量。',cards});
}
const src=JSON.parse(fs.readFileSync('data/vocabulary/vocabulary_items.json','utf8'));
const seen=new Set();
const vocab=src.filter(x=>x.jp&&x.kana&&x.zh).filter(x=>{const k=`${x.jp}|${x.kana}|${x.zh}`;if(seen.has(k))return false;seen.add(k);return true;}).map((x,i)=>({id:`vocab-${String(i+1).padStart(4,'0')}`,jp:x.jp,kana:x.kana,zh:x.zh,pos:x.pos||'詞彙',category:(x.categories?.[0]||'基礎').replace(/^cat_/,''),mode:'看日文選中文',prompt:'這個詞是什麼意思？',example_jp:x.example?.jp||`${x.jp}を覚えます。`,example_zh:x.example_zh||`${x.zh}的例句。`,audio:true,rank:i+1,source:'local curated seed'}));
const attribution={version:'Kotoba Trip V5 Open Content',sources:[{name:'Hanabira Japanese Content',url:'https://github.com/tristcoil/hanabira.org-japanese-content',license_note:'Creative Commons License; attribution/link to hanabira.org required.',used_for:'JLPT N5-N1 grammar points and example sentences'},{name:'Tatoeba',url:'https://tatoeba.org/en/downloads',license_note:'CC BY 2.0 FR / CC0 depending on sentence; not imported in this V5 build yet because Tatoeba recommends filtering and proofreading learning materials.',used_for:'researched as future sentence source'}]};
fs.mkdirSync(outDir,{recursive:true});
fs.writeFileSync(path.join(outDir,'scene_questions.json'),JSON.stringify(scenes,null,2)+'\n');
fs.writeFileSync(path.join(outDir,'vocabulary_cards.json'),JSON.stringify(vocab,null,2)+'\n');
fs.writeFileSync(path.join(outDir,'source_attribution.json'),JSON.stringify(attribution,null,2)+'\n');
console.log('open grammar questions',scenes.reduce((s,x)=>s+x.cards.length,0));
console.log('unique vocab',vocab.length);
