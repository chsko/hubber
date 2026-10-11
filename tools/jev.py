#!/usr/bin/env python3
"""Ask Jev (TypeSafe System One) typed questions from the command line.

Agent decision helper used while building Hubby.

Usage:
  tools/jev.py request.json          # {"state": ..., "questions": {...}}
  echo '{...}' | tools/jev.py -      # read request from stdin
  tools/jev.py request.json --raw    # print the full API response

Requires TYPESAFE_API_KEY. Model defaults to jev-latest (override with JEV_MODEL).
"""
import json
import os
import sys
import urllib.request

API_URL = "https://api.typesafe.ai/v1/systemone"


def ask(request: dict) -> dict:
    body = {"model": os.environ.get("JEV_MODEL", "jev-latest"), **request}
    req = urllib.request.Request(
        API_URL,
        data=json.dumps(body).encode(),
        headers={
            "Authorization": f"Bearer {os.environ['TYPESAFE_API_KEY']}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.load(resp)


def summarize(answer: dict) -> str:
    kind = answer["type"]
    if kind == "noul":
        return f"noul={answer['noul']:.2f}"
    probs = sorted(answer["probabilities"].items(), key=lambda kv: -kv[1])
    dist = ", ".join(f"{k}:{v:.2f}" for k, v in probs[:5])
    head = f"choice={answer['choice']}" if kind == "choice" else f"score={answer['score']:.2f}"
    return f"{head} conf={answer['confidence']:.2f} [{dist}]"


def main() -> None:
    args = [a for a in sys.argv[1:] if a != "--raw"]
    src = sys.stdin if not args or args[0] == "-" else open(args[0])
    result = ask(json.load(src))
    if "--raw" in sys.argv:
        print(json.dumps(result, indent=2))
        return
    for qid, answer in result["answers"].items():
        print(f"{qid}: {summarize(answer)}")
    print(f"# model={result['model']} tokens={result['usage']['input_tokens']}")


if __name__ == "__main__":
    main()
