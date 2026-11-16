import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const titles = ['Saiyan Legacy Reborn','Other World Trial','Kai Frontier','Z-Fighter Remix','Capsule Quest','Majin Eclipse','Namek Redux'];
const externals = [
  {id:'ext-forumhack001',title:'Super Saiyan Frontier',developer:'Unknown creator',game:'legacy-of-goku-2',category:'rom-hack',status:'released',source:{type:'forum',url:'https://forum.example.org/threads/super-saiyan-frontier.4812/'},distribution:{label:'Download Patch',url:'https://files.example.org/frontier.bps',kind:'patch'},ownership:{claim:'unclaimed',representation_verified:false},colors:['#d03850','#f8d040']},
  {id:'ext-sitehack0002',title:'Capsule Corp Toolkit',developer:'Bulma Labs',game:'multiple',category:'tool',status:'in-development',source:{type:'website',url:'https://toolkit.example.net/'},ownership:{claim:'verified-claim',representation_verified:false},colors:['#20a0a8','#f8f8f8']}
];
export async function fixtureInput(destination, empty = false, unfeatured = false, external = false) {
  if (empty) return {catalog:{schema_version:1,projects:[],filters:{games:[],categories:[],statuses:[]},sort:{name:[],release_date:[],update_date:[]}},provenance:{purpose:'fixture',warning:'Empty-state preview only'}};
  const projects = [];
  for (let i = 0; i < titles.length; i++) {
    const id = 'fixture-' + i;
    const cover = `assets/${id}/cover.webp`;
    const screenshots = i === 0 ? [1,2,3].map(n => `assets/${id}/screenshot-${n}.webp`) : [];
    const directory = path.join(destination,'public/assets',id); await fs.mkdir(directory,{recursive:true});
    const colors = [['#1888f8','#f8d040'],['#7860c8','#f8a858'],['#206078','#9880f8'],['#2060a8','#f8d040'],['#20a0a8','#f8f8f8'],['#9040f8','#f87070'],['#208858','#90c8f8']][i];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="${colors[0]}"/><circle cx="510" cy="70" r="45" fill="${colors[1]}"/><path d="M0 220 100 150 180 190 320 100 430 190 640 130V360H0" fill="#202040"/><path d="M0 300 150 220 260 270 420 210 640 250V360H0" fill="${colors[1]}"/><path d="m180 320 35-150 25 25 25-55 40 80 50 100" fill="#282828"/><text x="24" y="40" font-family="Arial" font-size="18" fill="#f8f8f8">ISOLATED VISUAL TEST ART ${i+1}</text></svg>`;
    await sharp(Buffer.from(svg)).webp().toFile(path.join(destination,'public',cover));
    for (const s of screenshots) await sharp(Buffer.from(svg)).resize(480,320,{fit:'contain'}).webp().toFile(path.join(destination,'public',s));
    const version = 'fixture-v1';
    projects.push({id,title:titles[i],developer:['KaiByte','NimbusDev','KaiByte','RemixArc','CapsuleWorks','EclipseTeam','NamekForge'][i],description: 'A full-scale overhaul of Legacy of Goku II that reimagines the Z-fighters’ journey with expanded areas, new fights, rebalanced gameplay, and additional story content that bridges the anime’s Android and Cell arcs like never before.',game:['legacy-of-goku-2','legacy-of-goku-2','buus-fury','legacy-of-goku','legacy-of-goku-2','buus-fury','legacy-of-goku-2'][i],category:i===4?'tool':'rom-hack',status:i===1||i===5?'in-development':'released',featured:i===0,repository:'https://github.com/fixture-owner/'+id,repository_id:900000+i,archived:false,availability:'available',warning:null,cover,screenshots,release:i===1?null:{version,download_url:`https://github.com/fixture-owner/${id}/releases/download/${version}/fixture.zip`,file_name:'fixture.zip',file_size:33973862,release_date:`2025-03-${String(14+i).padStart(2,'0')}T00:00:00Z`,updated_at:'2025-03-21T00:00:00Z',sha256:null},last_updated:`2025-04-${String(14+i).padStart(2,'0')}T00:00:00Z`,search_text:titles[i].toLowerCase()+' '+['kaibyte','nimbusdev'][i%2],links:i===0?[{label:'Project documentation',url:'https://github.com/fixture-owner/fixture-0'}]:[]});
  }
  if (external) for (const item of externals) {
    const {colors, ...rest} = item;
    const directory = path.join(destination,'public/assets',item.id); await fs.mkdir(directory,{recursive:true});
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="${colors[0]}"/><circle cx="320" cy="150" r="70" fill="${colors[1]}"/></svg>`;
    await sharp(Buffer.from(svg)).webp().toFile(path.join(directory,'cover.webp'));
    projects.push({...rest,description:'A community listed project hosted outside GitHub, used to verify the external listing layout in fixtures only.',featured:false,availability:'available',warning:null,cover:`assets/${item.id}/cover.webp`,screenshots:[],release:null,last_updated:'2025-05-01T00:00:00Z',search_text:(item.title+' '+item.developer).toLowerCase()});
  }
  for (const p of projects) {
    if (unfeatured) p.featured = false;
    if (unfeatured && p.id === 'fixture-6') p.title = 'W'.repeat(100);
    if (p.id === 'fixture-6') p.description += ' <img src=x onerror="window.fixtureInjected=true">';
    p.search_text = [p.title,p.developer,p.description,p.game,p.category].join(' ').normalize('NFKC').toLowerCase();
  }
  const catalog = {schema_version:1,projects,filters:{games:[...new Set(projects.map(p=>p.game))],categories:['rom-hack','tool'],statuses:['released','in-development']},sort:{name:[...projects].sort((a,b)=>a.title.localeCompare(b.title)).map(p=>p.id),release_date:projects.map(p=>p.id),update_date:projects.map(p=>p.id)}};
  return {catalog,provenance:{purpose:'fixture',warning:'Not approved community projects; never deploy'}};
}
