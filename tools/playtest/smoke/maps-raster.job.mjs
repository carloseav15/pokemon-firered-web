// PREPARED: select six real maps through the existing inspector probe. No game state is prepared.
// Compare Python-prepared PNGs to the independent existing browser TileRenderer, not to a ROM.
export default async function run(ctx) {
  const p=ctx.page,base=process.env.PW_BASE??'http://localhost:5174/';
  const result=[];
  for(const [game,ids] of [
    ['firered',['MAP_PALLET_TOWN','MAP_PALLET_TOWN_PROFESSOR_OAKS_LAB','MAP_VIRIDIAN_FOREST']],
    ['emerald',['MAP_LITTLEROOT_TOWN','MAP_OLDALE_TOWN','MAP_GRANITE_CAVE_1F']]
  ]){
    await p.goto(new URL(`viewer.html?legacy=1${game==='emerald'?'&game=emerald':''}`,base).href);
    await p.waitForFunction(()=>window.frInterior);
    for(const id of ids){
      const sample=await p.evaluate(async({id,game})=>{
        const catalog=await(await fetch(`/map-viewer/${game}/catalog.json`)).json();
        const root=game==='firered'?'/fr':'/emerald';
        const header=await(await fetch(`${root}/maps/${id}.json`)).json();
        const layout=await(await fetch(`${root}/layouts/${header.layout}.json`)).json();
        await window.frInterior.open(id);
        const live=document.querySelector('.interior-map canvas');
        const image=new Image();image.src=`/map-viewer/${game}/${catalog.maps[id].image}`;await image.decode();
        const c=document.createElement('canvas');c.width=image.naturalWidth;c.height=image.naturalHeight;c.getContext('2d').drawImage(image,0,0);
        if(live.width!==c.width||live.height!==c.height)throw Error('geometry mismatch '+id);
        const expected=live.getContext('2d').getImageData(0,0,c.width,c.height).data;
        const actual=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
        const bytes=Uint8Array.from(atob(layout.blocks),c=>c.charCodeAt(0));
        const blocks=new Uint16Array(bytes.buffer);
        let compared=0;
        for(let b=0;b<blocks.length;b+=Math.max(1,Math.floor(blocks.length/47))){
          if(blocks[b]&0xc00)continue; // Inspector adds red tint on blocked tiles; base PNG has no collision overlay.
          const x=(b%layout.width)*16,y=Math.floor(b/layout.width)*16;
          for(let py=0;py<16;py++)for(let px=0;px<16;px++){
            const offset=((y+py)*c.width+x+px)*4;
            if(expected[offset+3]===0)continue; // Static PNG uses a black backdrop for transparent BG pixels.
            for(let channel=0;channel<3;channel++)if(expected[offset+channel]!==actual[offset+channel])throw Error(`pixel mismatch ${id} ${x+px},${y+py} channel ${channel}: ${expected[offset+channel]} / ${actual[offset+channel]}`);
            compared++;
          }
        }
        return {id,compared,width:c.width,height:c.height};
      },{id,game});
      if(!sample.compared)throw Error('no pixels compared '+id);
      result.push({game,...sample});
    }
  }
  return {prepared:'Real map selection through inspector probe; sampling skips its red collision tint and transparent pixels',comparison:'Independent existing TileRenderer vs prepared static PNG; no ROM/gameplay parity claim',result};
}
