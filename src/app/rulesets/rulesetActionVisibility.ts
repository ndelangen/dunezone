type RulesetActionVisibilityInput = {
  hasProfile: boolean;
  canChangeGroup: boolean;
  canDelete: boolean;
  hasAssignedGroup: boolean;
};

export function rulesetActionVisibility({
  hasProfile,
  canChangeGroup,
  canDelete,
  hasAssignedGroup,
}: RulesetActionVisibilityInput) {
  return {
    askQuestion: hasProfile,
    assignGroup: canChangeGroup && !hasAssignedGroup && hasProfile,
    removeGroup: canChangeGroup && hasAssignedGroup,
    deleteRuleset: canDelete,
  };
}
