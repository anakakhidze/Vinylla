"""Quick evaluation: runs each request and checks the agent answers with songs. Needs GEMINI_API_KEY and the backend running."""
import json
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()
from agent import run_agent  # noqa: E402

cases = json.loads(Path(__file__).with_name("eval_cases.json").read_text(encoding="utf-8"))
passed = 0
for case in cases:
    try:
        out = run_agent([{"role": "user", "content": case["request"]}], None)
        ok = len(out["songs"]) >= 1 and bool(out["reply"].strip())
    except Exception as e:
        out, ok = {"reply": str(e), "songs": []}, False
    passed += ok
    print(("PASS" if ok else "FAIL"), "-", case["request"], "->", [s["title"] for s in out["songs"]])
print(f"{passed}/{len(cases)} passed")
