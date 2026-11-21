/**
 * Fragmentos reales del repositorio (protocol/bank.py, mechanisms/zkp/server.py,
 * protocol/fiat_shamir.py) con su numeración, como los enviaría el banco en data.span.
 */
import type { CodeSpan } from "../../../shared/types";

type Lines = ReadonlyArray<readonly [number, string]>;

function span(file: string, fn: string, lines: Lines, highlight: number[], tone: CodeSpan["tone"] = "ok"): CodeSpan {
  return { file, function: fn, lines: lines.map(([n, text]) => ({ n, text })), highlight, tone };
}

export const PARAMS_SPAN = span("mechanisms/zkp/server.py", "ZkpServer.read_params", [
  [101, "    def read_params(self) -> ParamsResponse:"],
  [102, '        """Parámetros públicos del grupo (p, q, g). Cubre R1 y R11."""'],
  [103, "        gp = self.gp"],
  [104, "        return ParamsResponse(name=gp.name, p=str(gp.p), q=str(gp.q), g=str(gp.g), bits=gp.bits)"],
], [104]);

export const REGISTER_SPAN = span("protocol/bank.py", "Bank.register", [
  [68, "    def register(self, user_id: str, y: int) -> VerifyResult:"],
  [70, "        if not isinstance(user_id, str) or not _USER_ID_REGEX.fullmatch(user_id):"],
  [71, "            return VerifyResult(False, Reason.INVALID_USER_ID)"],
  [72, "        if user_id in self._users:"],
  [73, "            return VerifyResult(False, Reason.USER_EXISTS)"],
  [74, "        if y == 1:"],
  [75, "            return VerifyResult(False, Reason.Y_IS_ONE)"],
  [76, "        if not in_subgroup(y, self._gp):"],
  [77, "            return VerifyResult(False, Reason.Y_NOT_IN_SUBGROUP)"],
  [78, "        self._users[user_id] = y"],
  [79, "        return VerifyResult(True, Reason.REGISTERED, attempts_left=self._max_attempts)"],
], [76, 78]);

export const CHALLENGE_SPAN = span("protocol/bank.py", "Bank.challenge", [
  [81, "    def challenge(self, user_id: str, t: int, c: int | None = None) -> tuple[str, int] | VerifyResult:"],
  [95, "        if not in_subgroup(t, self._gp):"],
  [96, "            return self._fail(user_id, Reason.T_NOT_IN_SUBGROUP)"],
  [99, "        c_value = secrets.randbelow(self._gp.q) if c is None else c"],
  [100, "        session_id = secrets.token_hex(SESSION_ID_BYTES)"],
  [101, "        self._sessions[session_id] = (user_id, t, c_value)"],
  [102, "        self._open_sessions[user_id] = session_id"],
  [103, "        return session_id, c_value"],
], [99]);

export const DECIDE_SPAN = span("protocol/bank.py", "Bank._decide", [
  [161, "    def _decide(self, user_id: str, transcript: Transcript, trace: list[str] | None) -> VerifyResult:"],
  [163, "        t, c, s = transcript.t, transcript.c, transcript.s"],
  [164, "        if not 0 <= s <= self._gp.q - 1:"],
  [165, "            return self._fail(user_id, Reason.S_OUT_OF_RANGE, transcript)"],
  [166, "        details = self._verification_details(self._users[user_id], t, c, s, trace)"],
  [167, '        if details["gs"] == details["tyc"] and details["t_rec"] == t:'],
  [168, "            self._failures[user_id] = 0"],
  [169, "            return VerifyResult(True, Reason.ACCESS_GRANTED, transcript, details, self._max_attempts)"],
  [170, "        return self._fail(user_id, Reason.CONGRUENCE_FAILED, transcript, details)"],
], [167]);

export const REPLAY_SPAN = span("protocol/bank.py", "Bank.verify", [
  [105, "    def verify(self, session_id: str, s: int, trace: list[str] | None = None) -> VerifyResult:"],
  [114, "        session = self._sessions.pop(session_id, None)"],
  [115, "        if session is None:"],
  [116, "            return VerifyResult(False, Reason.INVALID_SESSION)"],
  [117, "        user_id, t, c = session"],
  [118, "        self._open_sessions.pop(user_id, None)"],
  [119, "        if self.is_locked(user_id):"],
  [120, "            return VerifyResult(False, Reason.ACCOUNT_LOCKED, attempts_left=0)"],
  [121, "        return self._decide(user_id, Transcript(t=t, c=c, s=s), trace)"],
], [114, 115, 116], "bad");

export const NIZK_SPAN = span("protocol/fiat_shamir.py", "verify_nizk", [
  [124, "    if protect:"],
  [125, "        stale = _freshness_problem(bank, proof, current_timestamp() if now is None else now, window)"],
  [126, "        if stale is not None:"],
  [127, "            return VerifyResult(False, stale)"],
  [128, "    m = proof.m if protect else None"],
  [130, "    def challenge_for(y: int) -> int:"],
  [131, "        return hash_challenge(bank.gp, y, proof.t, proof.user_id, m)"],
  [133, "    result = bank.verify_proof(proof.user_id, proof.t, proof.s, challenge_for)"],
  [134, "    if protect and result.accepted:"],
  [135, "        bank.record_proof(proof.t, proof.s)"],
], [131, 133]);
