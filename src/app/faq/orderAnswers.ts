export function orderFaqAnswers<TAnswer extends { _id: string }>(
  answers: readonly TAnswer[],
  acceptedAnswerId: string | null | undefined
): readonly TAnswer[] {
  if (acceptedAnswerId == null) {
    return answers;
  }
  const acceptedIndex = answers.findIndex((answer) => answer._id === acceptedAnswerId);
  if (acceptedIndex <= 0) {
    return answers;
  }
  return [
    answers[acceptedIndex],
    ...answers.slice(0, acceptedIndex),
    ...answers.slice(acceptedIndex + 1),
  ];
}
