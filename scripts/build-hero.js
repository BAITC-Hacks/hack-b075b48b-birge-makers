import { mkdir, writeFile } from 'node:fs/promises';

// Original local vector illustration. No remote assets, raster downloads or fonts.
const chairs = [[350,820],[550,870],[765,910],[1030,900],[1170,800],[1040,667],[810,610],[560,647]].map(([x,y],i) => `<g transform="translate(${x} ${y}) rotate(${i<4?-12:165})"><path d="M-46 15v-70a46 46 0 0 1 92 0v70" fill="none" stroke="#745742" stroke-width="10"/><path d="M-35 0v-50m18 50v-67m18 67v-70m18 70v-67m18 67v-50" stroke="#99816a" stroke-width="4"/><ellipse cy="25" rx="49" ry="22" fill="#b29979"/><path d="M-33 34l-12 72m79-72l12 72" stroke="#745742" stroke-width="9"/></g>`).join('');
const flowers = [[530,743],[830,740],[1040,775]].map(([x,y]) => `<g transform="translate(${x} ${y})"><ellipse cy="18" rx="38" ry="12" fill="#b59f7d" opacity=".3"/><path d="M-20-10l8 39h27l8-39z" fill="#c8bba5"/><path d="M0 0l-12-84M0 0l36-64M0 0l-38-40" fill="none" stroke="#647152" stroke-width="5"/><ellipse cx="-20" cy="-50" rx="12" ry="30" transform="rotate(-37 -20 -50)" fill="#6c7c58"/><ellipse cx="22" cy="-30" rx="12" ry="29" transform="rotate(38 22 -30)" fill="#74805c"/><g fill="#b85e41"><circle cx="-12" cy="-88" r="17"/><circle cx="-25" cy="-94" r="13"/><circle cx="-4" cy="-102" r="13"/></g><g fill="#eee6d4"><circle cx="33" cy="-65" r="17"/><circle cx="42" cy="-76" r="13"/><circle cx="24" cy="-78" r="13"/></g></g>`).join('');
const scene = `<defs><linearGradient id="wall" x2="0" y2="1"><stop stop-color="#ddd9c9"/><stop offset="1" stop-color="#eae5d6"/></linearGradient><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#c5cec1"/><stop offset="1" stop-color="#ecebdb"/></linearGradient><linearGradient id="cloth" x2="0" y2="1"><stop stop-color="#fff9e9"/><stop offset="1" stop-color="#d8cbb6"/></linearGradient></defs>
<path fill="url(#wall)" d="M0 0h1536v1344H0z"/><path fill="#cfc6b4" d="M0 750l1536-50v644H0z"/>
<path d="M300 740V390a222 222 0 0 1 444 0v350z" fill="#c5bea9"/><path d="M330 728V390a192 192 0 0 1 384 0v338z" fill="url(#sky)"/>
<path d="M820 720V390a222 222 0 0 1 444 0v330z" fill="#c5bea9"/><path d="M850 708V390a192 192 0 0 1 384 0v318z" fill="url(#sky)"/>
<path d="M330 590q105-115 207-5t177-10v155H330z" fill="#a5ae91"/><path d="M330 644q156-110 384-26v112H330z" fill="#889c7a"/><path d="M850 603q153-156 384-3v108H850z" fill="#a5ae91"/><path d="M850 660q190-114 384-10v60H850z" fill="#889c7a"/>
<path d="M522 210v520m-192-268h384m328-242v490m-192-258h384" stroke="#d9d1bc" stroke-width="13"/>
<path d="M260 733h492m38-15h496" stroke="#b5a88e" stroke-width="15"/>
<path d="M180 0v330m588-330v212m540-212v350" stroke="#5d6051" stroke-width="3"/>
<path d="M113 355q0-82 67-82t67 82zM710 243q0-73 58-73t58 73zM1240 372q0-80 68-80t68 80z" fill="#a07b58"/>
<path d="M125 349h110m486-111h93m438 128h111" stroke="#d8b884" stroke-width="6"/>
<ellipse cx="793" cy="1070" rx="537" ry="106" fill="#8b7a64" opacity=".17"/>
${chairs}
<path d="M323 771q245-152 692-67l199 139-84 251q-467 95-833-108z" fill="url(#cloth)"/>
<ellipse cx="760" cy="808" rx="444" ry="134" transform="rotate(6 760 808)" fill="#f9f0dc"/>
<path d="M390 884l-29 105m195-51l-10 105m183-80l9 95m177-92l-2 115m162-153l-6 134" stroke="#cdbfa7" stroke-width="3" opacity=".7"/>
<path d="M351 777q393-72 790 53l-39 55q-390-119-765-47z" fill="#a5ad8e" opacity=".6"/>
<g fill="#eee5d0" stroke="#c8bca2" stroke-width="3">${[[440,827],[650,907],[900,921],[1100,860],[1050,744],[760,713],[536,726]].map(([x,y])=>`<ellipse cx="${x}" cy="${y}" rx="44" ry="20"/>`).join('')}</g>
<g fill="#ede5ce" stroke="#bcaa87" stroke-width="3"><path d="M647 735v-93h12v93m257 88v-91h12v91"/><ellipse cx="653" cy="741" rx="21" ry="7"/><ellipse cx="923" cy="828" rx="21" ry="7"/></g><g fill="#c78140"><path d="M653 627q-12 15 0 22q12-7 0-22m270 88q-12 15 0 22q12-7 0-22"/></g>
${flowers}
<path d="M104 995Q207 655 111 440m10 325Q20 684 34 616m95 78q92-99 56-160" fill="none" stroke="#667755" stroke-width="11"/>
<g fill="#6e7c55">${[[93,700,-50],[110,571,-35],[128,632,35],[65,630,-40],[157,588,40],[88,795,-60],[124,825,45]].map(([x,y,r])=>`<ellipse cx="${x}" cy="${y}" rx="28" ry="80" transform="rotate(${r} ${x} ${y})"/>`).join('')}</g>
<path d="M58 961h113l-18 123H78z" fill="#a46c4a"/><ellipse cx="114" cy="959" rx="56" ry="12" fill="#705640"/>
<path d="M1432 0q-200 180-96 540m31-192q-148-28-120-122m104 172q125-55 145-152" fill="none" stroke="#667755" stroke-width="9"/>
<g fill="#7b8966"><ellipse cx="1364" cy="140" rx="30" ry="88" transform="rotate(38 1364 140)"/><ellipse cx="1275" cy="247" rx="27" ry="70" transform="rotate(-50 1275 247)"/><ellipse cx="1409" cy="300" rx="26" ry="70" transform="rotate(50 1409 300)"/></g>`;
await mkdir('public/assets', { recursive: true });
for (const width of [640,960,1536]) {
  await writeFile(`public/assets/hero-${width}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${width*7/8}" viewBox="0 0 1536 1344">${scene}</svg>`, 'utf8');
}
console.log('Created three local responsive SVG assets.');
