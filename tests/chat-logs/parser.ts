import {
  string,
  anyStringOf,
  spaces1,
  space,
  Parjser,
  regexp,
  position,
  noCharOf,
  digit,
  int,
  anyCharOf,
  uniLetter,
  uniDecimal,
  float,
} from "parjs";
import {
  many,
  map,
  or,
  then,
  qthen,
  thenq,
  stringify,
  manySepBy,
  recover,
  must,
  many1,
  between,
  exactly,
  maybe,
} from "parjs/combinators";

type Instruction<Type extends string> = {
  type: Type;
  position: {
    start: number;
    end: number;
  };
};

type ArgumentInstruction<A, Type extends string> = Instruction<Type> & {
  [P in Type]: A;
};

type JsonPath<Type extends string> = Instruction<Type> & {
  json: string;
  path: string[];
  jsonPosition: {
    start: number;
    end: number;
  };
};

type Save<Path extends string> = Instruction<"save"> & {
  json: string;
  path: Path;
};

type Chat = Instruction<"chat"> & {
  chatter: Chatter;
  message: string;
  time: string;
  messagePosition: {
    start: number;
    end: number;
  };
};

type Comment = Instruction<"comment"> & {
  comment: string;
};

function spaces0() {
  return space().pipe(many(), stringify());
}

function argument() {
  return noCharOf(" \t\r\n").pipe(many(), stringify());
}

function allArguments() {
  const word = noCharOf(" \t\r\n");
  const spaceWord = spaces1().pipe(then(noCharOf(" \t\r\n")));
  const either = word.pipe(
    or(spaceWord),
    recover(() => ({ kind: "Soft" }))
  );
  return either.pipe(many(), stringify());
}

function comment() {
  return spaces0().pipe(
    then(anyStringOf("//", "#")),
    qthen(
      position().pipe(
        then(allArguments()),
        then(position()),
        between(spaces0())
      )
    ),
    map(
      ([[start, value], end]): Comment => ({
        type: "comment",
        comment: value,
        position: {
          start,
          end,
        },
      })
    )
  );
}

function instruction<T extends string>(name: T) {
  return spaces0().pipe(
    qthen(
      position().pipe(then(string(name)), then(position()), between(spaces0()))
    ),
    map(
      ([[start, value], end]): Instruction<T> => ({
        type: value,
        position: { start, end },
      })
    )
  );
}

function argumentInstruction<A, T extends string>(
  name: T,
  argument: Parjser<A>
) {
  return spaces0().pipe(
    qthen(
      position().pipe(
        then(string(name)),
        thenq(spaces1()),
        then(argument),
        then(position()),
        between(spaces0())
      )
    ),
    map(
      ([[[start, value], argument], end]): ArgumentInstruction<A, T> =>
        ({
          type: value,
          [name]: argument,
          position: { start, end },
        }) as ArgumentInstruction<A, T>
    )
  );
}

function chatLine() {
  return spaces0().pipe(
    qthen(
      position()
        .pipe(
          thenq("["),
          then(time()),
          thenq("]"),
          thenq(spaces1()),
          then(chatter()),
          thenq(": ")
        )
        .pipe(
          then(position()),
          then(noCharOf("\r\n").pipe(many(), stringify())),
          then(position()),
          between(spaces0())
        )
    ),
    map(
      ([[[[[start, time], chatter], messageStart], message], end]): Chat => ({
        type: "chat",
        time,
        chatter,
        message,
        position: { start, end },
        messagePosition: { start: messageStart, end },
      })
    )
  );
}

function jsonPath<T extends string>(name: T) {
  return spaces0().pipe(
    qthen(
      position()
        .pipe(
          then(string(name)),
          then(
            string("/").pipe(
              qthen(noCharOf(" \t/").pipe(many(), stringify(), manySepBy("/"))),
              maybe()
            )
          ),
          thenq(spaces1()),
          then(position()),
          then(allArguments()),
          then(position())
        )
        .pipe(between(spaces0()))
    ),
    map(
      ([[[[[start, value], path], jsonStart], json], end]): JsonPath<T> => ({
        type: value,
        json,
        path: path ?? [],
        position: { start, end },
        jsonPosition: {
          start: jsonStart,
          end,
        },
      })
    )
  );
}

function save<T extends string>(path: T) {
  return spaces0().pipe(
    qthen(
      position().pipe(
        thenq("save:"),
        then(string(path)),
        thenq(spaces1()),
        then(allArguments()),
        then(position()),
        between(spaces0())
      )
    ),
    map(
      ([[[start, path], json], end]): Save<T> => ({
        type: "save",
        json,
        path,
        position: { start, end },
      })
    )
  );
}

function digits(count: number) {
  return digit(10).pipe(exactly(count));
}

function date() {
  return digits(4).pipe(
    then("-"),
    then(digits(2)),
    then("-"),
    then(digits(2)),
    stringify()
  );
}

function time() {
  const hour1 = anyCharOf("01").pipe(then(digit(10)));
  const hour2 = string("2").pipe(then(anyCharOf("01234")));
  const hour = hour1.pipe(or(hour2));
  const min = anyCharOf("012345").pipe(then(digit(10)));
  const sec1 = anyCharOf("012345").pipe(then(digit(10)));
  const sec2 = string("60");
  const sec = sec1.pipe(or(sec2));
  return hour.pipe(then(":"), then(min), then(":"), then(sec), stringify());
}

function iso8601() {
  return date().pipe(
    then("T"),
    then(time()),
    then("."),
    then(digits(3)),
    then("Z"),
    stringify()
  );
}

function anyInstruction() {
  return comment().pipe(
    or(
      instruction("restart"),
      argumentInstruction(
        "accuracy",
        int({
          allowSign: false,
          base: 10,
        })
      ),
      argumentInstruction(
        "chatbot",
        argument().pipe(map((value) => value.toLowerCase()))
      ),
      argumentInstruction("settings", allArguments()),
      argumentInstruction(
        "chatters",
        chatter().pipe(
          manySepBy(","),
          map((value: Chatter[]): Chatter[] => value)
        )
      ),
      jsonPath("queue.json"),
      jsonPath("extensions"),
      save("data/queue.json").pipe(recover(() => ({ kind: "Soft" }))),
      save("data/extensions/customcode.json"),
      argumentInstruction("random", float()),
      argumentInstruction("uuidv4", argument()),
      argumentInstruction("fs-fail", argument()),
      argumentInstruction(
        "time",
        iso8601().pipe(map((s: string) => new Date(Date.parse(s))))
      ),
      chatLine()
    )
  );
}

export type Chatter = {
  displayName: string;
  username: string;
  isSubscriber: boolean;
  isMod: boolean;
  isBroadcaster: boolean;
};

function chatter(): Parjser<Chatter> {
  const roles = anyCharOf("~@%+$^*!&'? \t").pipe(
    many(),
    map((values) => ({
      isSubscriber: values.includes("%"),
      isMod: values.includes("@"),
      isBroadcaster: values.includes("~"),
    }))
  );
  const displayName = uniLetter().pipe(
    then(uniLetter().pipe(or(uniDecimal())).pipe(many())),
    stringify(),
    map((displayName) => ({ displayName }))
  );
  const pronouns = string("Any").pipe(
    or(
      "Other",
      noCharOf(")").pipe(
        many1(),
        must(
          (x) =>
            x.includes("/") || {
              kind: "Soft",
            }
        )
      )
    ),
    map(() => undefined)
  );
  const username: RegExp = /[a-z0-9_]{2,}/;
  return spaces0()
    .pipe(qthen(roles), thenq(spaces0()), then(displayName), thenq(spaces0()))
    .pipe(
      then(
        pronouns.pipe(
          or(
            regexp(username).pipe(
              stringify(),
              map((username) => ({ username }))
            )
          ),
          between("(", ")"),
          between(spaces0()),
          many(),
          map((values) => values.filter((value) => value !== undefined))
        )
      ),
      map(([[roles, { displayName }], usernames]) => ({
        ...roles,
        displayName,
        username:
          usernames.length > 0
            ? usernames[0].username
            : displayName.toLowerCase(),
      }))
    );
}

export function instructions() {
  return anyInstruction().pipe(
    or(spaces0().pipe(map(() => undefined))),
    manySepBy(/\r?\n/),
    map((result) => result.filter((value) => value !== undefined))
  );
}
