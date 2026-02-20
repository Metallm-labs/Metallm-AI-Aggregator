"""
  pip i bytez
"""

from bytez import Bytez

key = "81d7d6b696171fa201c6186134367013"
sdk = Bytez(key)

# choose veo-3.1-generate-preview
model = sdk.model("google/veo-3.1-generate-preview")

# send input to model
results = model.run("a guy walking on moon and watching the earth ")

print({ "error": results.error, "output": results.output })