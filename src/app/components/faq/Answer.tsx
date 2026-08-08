import clsx from 'clsx';
import type { ReactNode } from 'react';

type AnswerListProps = {
  children: ReactNode;
  className?: string;
};

function List({ children, className }: AnswerListProps) {
  return <ul className={className}>{children}</ul>;
}

type AnswerItemProps = {
  children: ReactNode;
  className?: string;
  id?: string;
  isAccepted?: boolean;
};

function Item({ children, className, id, isAccepted = false }: AnswerItemProps) {
  return (
    <li id={id} className={clsx(className)} data-accepted={isAccepted ? 'true' : 'false'}>
      {children}
    </li>
  );
}

export const Answer = {
  List,
  Item,
};
