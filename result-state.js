/* Display only facts returned by /recommend; do not re-rank or re-explain. */
(function(root){
  'use strict';
  const reasons={
    busy:['busy','date'],busy_on_date:['busy','date'],unavailable:['busy','date'],
    budget:['budget','budget'],over_budget:['budget','budget'],budget_exceeded:['budget','budget'],
    format:['format','event'],event_format:['format','event'],unsupported_format:['format','event'],
    language:['language','language'],language_mismatch:['language','language'],
    hours:['hours','hours'],duration:['hours','hours'],duration_hours:['hours','hours'],duration_exceeded:['hours','hours'],
    calendar:['calendar','date'],missing_calendar:['calendar','date']
  };
  function describe(result){
    root.BirgeApi.validateRecommendation(result);
    const I=root.BirgeI18n;
    const status=result.status==='no_category_in_city'?'no_category':result.status;
    const counts=Object.entries(result.rejection_stats||{}).filter(([key,count])=>count>0&&reasons[key]).map(([key,count])=>({key,reason:reasons[key][0],count}));
    let actions=[];
    if(status==='no_category') actions=['city','category'];
    else if(status==='no_match'||result.cards.length<3){
      actions=counts.map(({key})=>reasons[key][1]);
      if(!actions.length&&status==='no_match') actions=['date','budget'];
      actions.push('category');
    }
    const limits=result.explanation_limitations;
    return {status,title:I.t({matched:'matchedTitle',no_category:'noCategoryTitle',no_match:'noMatchTitle'}[status]),message:result.meta_explanation,shown:result.cards.length,eligible:result.eligible_count,counts,actions:[...new Set(actions)],limitations:typeof limits==='string'?(limits.trim()?[limits]:[]):limits||[]};
  }
  const api={describe};
  root.BirgeResultState=api;
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
})(globalThis);
