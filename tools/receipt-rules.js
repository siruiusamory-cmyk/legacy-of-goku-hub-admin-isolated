export function receiptRulesCoverNamespaces(rules) {
  const refs = rules.conditions?.ref_name;
  return rules.target === 'tag' && rules.enforcement === 'active' &&
    ['refs/tags/loghub-anchor-v1/**', 'refs/tags/loghub-integration-anchor-v1/**'].every(ref => refs?.include?.includes(ref)) &&
    Array.isArray(refs.exclude) && refs.exclude.length === 0 &&
    (rules.bypass_actors === undefined || (Array.isArray(rules.bypass_actors) && rules.bypass_actors.length === 0)) &&
    ['update', 'deletion'].every(type => rules.rules?.some(r => r.type === type));
}
