/* Direct, text-based PDF download. No remote requests or printing dialog. */
window.createResultsPdf = async function(data, completed) {
  'use strict';
  const {PDFDocument, rgb} = window.PDFLib;
  const doc = await PDFDocument.create();
  doc.registerFontkit(window.fontkit);
  const response = await fetch(new URL('assets/vendor/DejaVuSans.ttf', document.baseURI));
  if (!response.ok) throw new Error('PDF font unavailable');
  const font = await doc.embedFont(await response.arrayBuffer(), {subset:true});
  doc.setTitle('Application Register UAT Results');
  doc.setSubject(`UAT session ${data.sessionDate}`);
  doc.setCreator('Application Register UAT Scenario Browser');
  const width=595.28, height=841.89, margin=46, usable=width-2*margin;
  const ink=rgb(.09,.18,.22), muted=rgb(.35,.42,.46), teal=rgb(.03,.35,.34);
  let page, y;
  const newPage=()=>{page=doc.addPage([width,height]);y=height-margin;};
  newPage();
  function wrap(text, size) {
    const lines=[];
    for(const paragraph of String(text ?? '').replace(/\t/g,'    ').split(/\r\n|\r|\n/)) {
      if(!paragraph){lines.push('');continue;}
      let line='';
      // Retain whitespace; split oversized tokens by Unicode code point.
      for(const token of paragraph.match(/\s+|\S+/gu) || []) {
        if(font.widthOfTextAtSize(line+token,size)<=usable){line+=token;continue;}
        if(line){lines.push(line);line='';}
        for(const character of token){if(font.widthOfTextAtSize(line+character,size)>usable && line){lines.push(line);line='';}line+=character;}
      }
      lines.push(line);
    }
    return lines;
  }
  function text(value,size=10,color=ink,gap=6) {
    for(const line of wrap(value,size)) {
      if(y-size*1.5<margin+20)newPage();
      if(line) page.drawText(line,{x:margin,y:y-size,size,font,color});
      y-=size*1.55;
    }
    y-=gap;
  }
  function section(label,value){if(y<margin+85)newPage();text(label,10,teal,2);text(value,10,ink,12);}
  text('APPLICATION REGISTER',10,teal,10);
  text('UAT results',25,ink,13);
  text('UAT session: 9 November 2026',11,ink,6);
  text('Exported: '+new Date().toLocaleString('en-GB',{timeZone:'Europe/London'})+' (Europe/London)',9,muted,8);
  text('Source: '+data.source,9,muted,15);
  text(`${completed.length} of ${data.scenarios.length} scenarios completed`,14,teal,10);
  for(const outcome of ['Pass','Fail','Partially Passed'])text(`${outcome}: ${completed.filter(s=>s.result.outcome===outcome).length}`,11,ink,4);
  text(`Not Started: ${data.scenarios.length-completed.length}`,11,ink,15);
  text('This report includes completed scenarios from all suites in workbook order. Historical results are not counted in this run.',10,muted,12);
  for(const s of completed) {
    newPage();
    text(s.suite,10,teal,8);
    text(s.scenarioId,11,teal,6);
    text(s.title,17,ink,12);
    text(s.caseKey,9,muted,5);
    text(`${data.sheet}, row ${s.sourceRow} · ${s.history}`,9,muted,12);
    section('Business goal',s.goal);
    section('Preconditions',s.preconditions);
    section('Given / When / And — Steps',s.steps);
    section('Then / Expected results',s.expected);
    section('Recorded outcome',s.result.outcome);
    section('Comments / observations',s.result.comments || '(No comments recorded)');
  }
  const pages=doc.getPages();
  pages.forEach((p,i)=>{
    p.drawLine({start:{x:margin,y:40},end:{x:width-margin,y:40},thickness:.5,color:rgb(.8,.85,.85)});
    p.drawText('Application Register · UAT results',{x:margin,y:26,size:8,font,color:muted});
    const label=`${i+1} / ${pages.length}`;
    p.drawText(label,{x:width-margin-font.widthOfTextAtSize(label,8),y:26,size:8,font,color:muted});
  });
  return doc.save();
};
