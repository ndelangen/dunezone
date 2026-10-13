/**
 * Who may do what on a FAQ question page: facts in, capabilities out.
 * The browser runs it, combining the public page with the viewer's user id;
 * the FAQ mutations enforce the same rules on every write.
 */

/** The public facts a question page carries about authorship: user ids, never anything about the viewer. */
type QuestionFacts = { askedBy: string };
type AnswerFacts = { answeredBy: string; accepted: boolean };

/**
 * The question page as one viewer sees it.
 * The question's asker edits and deletes it and accepts or unaccepts answers;
 * an answer's author alone edits it, and they or the asker delete it;
 * a signed-in viewer answers once.
 * `viewerAnswered` comes from an uncapped lookup, never from the listed answers: the page lists a bounded number of them.
 */
export function faqQuestionPageForViewer<
  Question extends QuestionFacts,
  Answer extends AnswerFacts,
  Rest extends object,
>(page: Rest & { question: Question; answers: readonly Answer[] }, viewerId: string | null, viewerAnswered: boolean) {
  const { question, answers, ...rest } = page;
  const questionOwner = viewerId !== null && viewerId === question.askedBy;
  return {
    ...rest,
    question: { ...question, capabilities: { editQuestion: questionOwner, deleteQuestion: questionOwner } },
    viewer: { answerQuestion: viewerId !== null && !viewerAnswered },
    answers: answers.map((answer) => {
      const answerOwner = viewerId !== null && viewerId === answer.answeredBy;
      return {
        ...answer,
        capabilities: {
          editAnswer: answerOwner,
          deleteAnswer: answerOwner || questionOwner,
          acceptAnswer: questionOwner && !answer.accepted,
          unacceptAnswer: questionOwner && answer.accepted,
        },
      };
    }),
  };
}
