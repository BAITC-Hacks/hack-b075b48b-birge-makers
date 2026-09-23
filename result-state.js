/* Result presentation and request outcomes, without modifying form values. */
(function (root) {
  'use strict';
  function describe(result, query) {
    const I = root.BirgeI18n;
    if (!['matched','no_category','no_match'].includes(result?.status) || !Array.isArray(result.cards) || result.cards.length > 3 || !Number.isInteger(result.poolCount) || !Number.isInteger(result.eligibleCount) || result.poolCount < result.eligibleCount || result.eligibleCount < 0 || !result.counts || !Array.isArray(result.excluded)) throw new Error('Invalid matching result');
    if (result.cards.length !== Math.min(3,result.eligibleCount) || result.excluded.length + result.eligibleCount !== result.poolCount) throw new Error('Inconsistent matching counts');
    if ((result.status === 'matched') !== (result.eligibleCount > 0) || (result.status === 'no_category') !== (result.poolCount === 0)) throw new Error('Inconsistent matching status');
    const counts = Object.entries(result.counts).filter(([,count]) => count > 0).map(([reason,count]) => ({reason,count}));
    const actions = [];
    let title, message;
    if (result.status === 'no_category') {
      title = I.t('noCategoryTitle');
      message = I.t('noCategoryText',{city:I.term(query.city),category:I.term(query.category)});
      actions.push('city','category');
    } else if (result.status === 'no_match') {
      title = I.t('noMatchTitle');
      message = I.t('noMatchIntro',{count:I.number(result.poolCount)});
    } else {
      title = I.t('matchedTitle');
      message = result.eligibleCount >= 3 ? I.t('enough',{count:I.number(result.eligibleCount)}) : I.t('few',{pool:I.number(result.poolCount),count:I.number(result.eligibleCount)});
      if (result.eligibleCount < 3 && !result.excluded.length) message += ' ' + I.t('rare');
    }
    if (result.status === 'no_match' || result.status === 'matched' && result.cards.length < 3) {
      const fields = {busy:'date',budget:'budget',format:'event',language:'language',hours:'hours'};
      counts.forEach(({reason}) => { if(fields[reason]) actions.push(fields[reason]); });
      actions.push('category');
    }
    return {status:result.status,title,message,counts,actions:[...new Set(actions)],shown:result.cards.length,eligible:result.eligibleCount};
  }
  function run(raw, categories, match = root.BirgeMatcher.match) {
    try {
      const validation = root.BirgeForm.validate(raw,categories);
      if(Object.keys(validation.errors).length) return {kind:'validation',errors:validation.errors};
      const query = validation.query;
      const result = match(root.BIRGE_PROFILES,query);
      return {kind:'result',query,result,state:describe(result,query)};
    } catch {
      // A failed computation is neither an empty catalogue nor a no-match outcome.
      return {kind:'technical'};
    }
  }
  root.BirgeResultState = {describe,run};
})(globalThis);
