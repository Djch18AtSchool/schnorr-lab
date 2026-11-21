/** Funciones de protocol/bank.py que muestra la terminal del banco simulado (copiadas del banco real). */
import type { CodeSpan } from "../../../shared/types";

type Lines = ReadonlyArray<readonly [number, string]>;

const REGISTER: Lines = [
  [85, "    def register(self, user_id: str, y: int) -> VerifyResult:"],
  [87, "        if not isinstance(user_id, str) or not _USER_ID_REGEX.fullmatch(user_id):"],
  [88, "            return VerifyResult(False, Reason.INVALID_USER_ID)"],
  [89, "        if user_id in self._users:"],
  [90, "            return VerifyResult(False, Reason.USER_EXISTS)"],
  [91, "        if y == 1:"],
  [92, "            return VerifyResult(False, Reason.Y_IS_ONE)"],
  [93, "        if not in_subgroup(y, self._gp):"],
  [94, "            return VerifyResult(False, Reason.Y_NOT_IN_SUBGROUP)"],
  [95, "        self._users[user_id] = y"],
  [96, "        return VerifyResult(True, Reason.REGISTERED, attempts_left=self._max_attempts)"],
];

const CHALLENGE: Lines = [
  [98, "    def challenge(self, user_id: str, t: int, c: int | None = None) -> tuple[str, int] | VerifyResult:"],
  [107, "        if user_id not in self._users:"],
  [108, "            return VerifyResult(False, Reason.USER_NOT_FOUND)"],
  [109, "        self._abandon_pending_session(user_id)"],
  [110, "        if self.is_locked(user_id):"],
  [111, "            return VerifyResult(False, Reason.ACCOUNT_LOCKED, attempts_left=0)"],
  [112, "        if not in_subgroup(t, self._gp):"],
  [113, "            return self._fail(user_id, Reason.T_NOT_IN_SUBGROUP)"],
  [116, "        c_value = secrets.randbelow(self._gp.q) if c is None else c"],
  [117, "        session_id = secrets.token_hex(SESSION_ID_BYTES)"],
  [118, "        self._sessions[session_id] = (user_id, t, c_value)"],
  [119, "        self._open_sessions[user_id] = session_id"],
  [120, "        return session_id, c_value"],
];

const DECIDE: Lines = [
  [178, "    def _decide(self, user_id: str, transcript: Transcript, trace: list[str] | None) -> VerifyResult:"],
  [180, "        t, c, s = transcript.t, transcript.c, transcript.s"],
  [181, "        if not 0 <= s <= self._gp.q - 1:"],
  [182, "            return self._fail(user_id, Reason.S_OUT_OF_RANGE, transcript)"],
  [183, "        details = self._verification_details(self._users[user_id], t, c, s, trace)"],
  [184, "        if details[\"gs\"] == details[\"tyc\"] and details[\"t_rec\"] == t:"],
  [185, "            self._failures[user_id] = 0"],
  [186, "            return VerifyResult(True, Reason.ACCESS_GRANTED, transcript, details, self._max_attempts)"],
  [187, "        return self._fail(user_id, Reason.CONGRUENCE_FAILED, transcript, details)"],
];

const span = (fn: string, lines: Lines, highlight: number[], tone: CodeSpan["tone"]): CodeSpan =>
  ({ file: "protocol/bank.py", function: fn, lines: lines.map(([n, text]) => ({ n, text })), highlight, tone });

export const registerSpan = (): CodeSpan => span("Bank.register", REGISTER, [95], "ok");
export const challengeSpan = (locked: boolean): CodeSpan =>
  locked ? span("Bank.challenge", CHALLENGE, [111], "bad") : span("Bank.challenge", CHALLENGE, [116, 118], "ok");
export const decideSpan = (accepted: boolean): CodeSpan => span("Bank._decide", DECIDE, accepted ? [184] : [187], accepted ? "ok" : "bad");
