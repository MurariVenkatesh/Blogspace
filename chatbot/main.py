from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import os
from langchain.llms import CTransformers  # Adjust if using a different library or module
from langchain.callbacks.base import BaseCallbackHandler
import time
import uuid

app = Flask(__name__)
CORS(app)

class StreamHandler(BaseCallbackHandler):
    def __init__(self):
        self.queue = []

    def on_llm_new_token(self, token: str, **kwargs) -> None:
        self.queue.append(token)

    def get_queue(self):
        queue_copy = self.queue[:]
        self.queue.clear()
        return queue_copy

model_id = 'TheBloke/Mistral-7B-codealpaca-lora-GGUF'
os.environ['XDG_CACHE_HOME'] = './model/cache'
config = {'temperature': 0.00, 'context_length': 4000}

handler = StreamHandler()

llm = CTransformers(
    model=model_id,
    model_type='mistral',
    config=config,
    callbacks=[handler]
)

# Dictionary to keep track of descriptions and their tokens
task_queue = {}

def generate_response(task_id):
    while True:
        tokens = task_queue[task_id].get_queue()
        if tokens:
            for token in tokens:
                yield f"data: {token}\n\n"
        time.sleep(0.1)

@app.route('/generate', methods=['POST'])
def generate():
    data = request.json
    description = data.get('description', '')
    task_id = str(uuid.uuid4())
    
    # Assign a new handler for this task
    task_queue[task_id] = StreamHandler()
    llm(description, callbacks=[task_queue[task_id]])

    return jsonify({'task_id': task_id})

@app.route('/stream/<task_id>', methods=['GET'])
def stream(task_id):
    return Response(generate_response(task_id), mimetype='text/event-stream')

if __name__ == '__main__':
    app.run(port=5000)
