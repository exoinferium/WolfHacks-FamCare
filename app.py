# FamCare Backend - Flask API Server
from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
import tensorflow as tf
import nltk
from nltk.stem.lancaster import LancasterStemmer
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import json
import os
from datetime import datetime

# Initialize Flask app
app = Flask(__name__)
CORS(app)  # Enable CORS for frontend requests

# Initialize stemmer
stemmer = LancasterStemmer()

# Download nltk dependencies
try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt')

try:
    nltk.data.find('corpora/stopwords')
except LookupError:
    nltk.download('stopwords')

from nltk.corpus import stopwords
stop_words = stopwords.words('english')

import string
punct_dict = dict((ord(punct), None) for punct in string.punctuation)

# ============ LOAD AND PREPARE DATA ============
categories = []
questions = []
answers = []

# Read CTAS.txt file
try:
    with open("CTAS.txt", "r") as f:
        lines = [line.strip() for line in f if line.strip()]

    for i in range(0, len(lines), 3):
        if i + 2 < len(lines):
            categories.append(lines[i])
            questions.append(lines[i + 1].lower())
            answers.append(lines[i + 2].lower())
except FileNotFoundError:
    print("WARNING: CTAS.txt not found. Chatbot will not work properly.")
    categories = ["Unknown"]
    questions = ["test"]
    answers = ["Please consult a healthcare professional"]

# Tokenize and remove stop words
word_tokens_stop = []
questions_tokenized_stopped = []
for i, question in enumerate(questions):
    question = question.translate(punct_dict)
    tokens = nltk.word_tokenize(question)
    tokens_stop = [w for w in tokens if not w in stop_words]
    word_tokens_stop.extend(tokens_stop)
    questions_tokenized_stopped.append(tokens_stop)

# Stem words
stemmed_words = [stemmer.stem(w) for w in word_tokens_stop]
stemmed_words = sorted(list(set(stemmed_words)))

sorted_categories = sorted(list(set(categories)))

# Prepare training data
training = []
output = []

for i, question in enumerate(questions_tokenized_stopped):
    training_row = []
    stemmed_question = [stemmer.stem(token) for token in question]

    for w in stemmed_words:
        training_row.append(1 if w in stemmed_question else 0)

    output_row = [0] * len(sorted_categories)
    output_row[sorted_categories.index(categories[i])] = 1

    training.append(training_row)
    output.append(output_row)

training = np.array(training)
output = np.array(output)

# ============ BUILD NEURAL NETWORK ============
input_size = len(training[0]) if len(training) > 0 else 100
output_size = len(output[0]) if len(output) > 0 else 1

model = tf.keras.Sequential([
    tf.keras.layers.Input(shape=(input_size,)),
    tf.keras.layers.Dense(8, activation='relu'),
    tf.keras.layers.Dense(8, activation='relu'),
    tf.keras.layers.Dense(output_size, activation='softmax')
])

model.compile(optimizer='adam', loss='categorical_crossentropy', metrics=['accuracy'])

# Train the model (only if we have valid data)
if len(training) > 0 and len(output) > 0:
    print("Training CTAS model...")
    model.fit(training, output, epochs=500, batch_size=8, verbose=0)
    print("CTAS model trained successfully!")
else:
    print("WARNING: No training data available. Model will use random predictions.")

# TF-IDF Vectorizer
vectorizer = TfidfVectorizer()
if len(questions) > 0:
    X = vectorizer.fit_transform(questions)
else:
    X = None

# ============ HELPER FUNCTIONS ============
def get_response(query, words):
    """Convert query to feature vector"""
    row = [0] * len(words)
    query = query.lower().translate(punct_dict)
    tokens = nltk.word_tokenize(query)
    tokens_stop = [w for w in tokens if w not in stop_words]
    stemmed_tokens = [stemmer.stem(word) for word in tokens_stop]

    for stemmed_word in stemmed_tokens:
        for i, w in enumerate(words):
            if w == stemmed_word:
                row[i] = 1

    return np.array(row)

def get_diagnosis(symptoms):
    """Get diagnosis and recommendation from symptoms"""
    response = get_response(symptoms, stemmed_words)
    
    # Make prediction
    results = model.predict(np.array([response]), verbose=0)
    results_index = np.argmax(results)
    
    if results_index < len(sorted_categories):
        diagnosis = sorted_categories[results_index]
    else:
        diagnosis = "Unknown Condition"
    
    # Get recommendation using TF-IDF cosine similarity
    if X is not None and len(questions) > 0:
        query_vector = vectorizer.transform([symptoms])
        similarities = cosine_similarity(query_vector, X)
        best_match_index = similarities.argmax()
        recommendation = answers[best_match_index] if best_match_index < len(answers) else "Please consult a healthcare professional"
    else:
        recommendation = "Please consult a healthcare professional"
    
    # Extract CTAS level from recommendation (format: "CTAS: X")
    ctas_level = "Unknown"
    for word in recommendation.split():
        if word.startswith("CTAS:"):
            ctas_level = word.replace("CTAS:", "")
            break
    
    return {
        "diagnosis": diagnosis,
        "recommendation": recommendation,
        "ctas": ctas_level
    }

# ============ API ROUTES ============

@app.route('/api/diagnose', methods=['POST'])
def diagnose():
    """Diagnose symptoms using CTAS model"""
    try:
        data = request.json
        symptoms = data.get('symptoms', '')
        
        if not symptoms:
            return jsonify({"error": "Symptoms required"}), 400
        
        result = get_diagnosis(symptoms)
        return jsonify(result), 200
    
    except Exception as e:
        print(f"Error in diagnose: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/assessment-record', methods=['POST'])
def save_assessment_record():
    """Save assessment record"""
    try:
        data = request.json
        
        # Load existing records
        records = []
        if os.path.exists('assessments.json'):
            with open('assessments.json', 'r') as f:
                records = json.load(f)
        
        # Add new record
        record = {
            "id": int(datetime.now().timestamp() * 1000),
            **data
        }
        records.append(record)
        
        # Save records
        with open('assessments.json', 'w') as f:
            json.dump(records, f, indent=2)
        
        return jsonify({"success": True, "message": "Assessment saved"}), 201
    
    except Exception as e:
        print(f"Error saving assessment: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/assessments', methods=['GET'])
def get_assessments():
    """Get all assessment records"""
    try:
        records = []
        if os.path.exists('assessments.json'):
            with open('assessments.json', 'r') as f:
                records = json.load(f)
        
        return jsonify(records), 200
    
    except Exception as e:
        print(f"Error retrieving assessments: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/assessment/<int:assessment_id>', methods=['DELETE'])
def delete_assessment(assessment_id):
    """Delete assessment record"""
    try:
        records = []
        if os.path.exists('assessments.json'):
            with open('assessments.json', 'r') as f:
                records = json.load(f)
        
        # Filter out the record
        records = [r for r in records if r.get('id') != assessment_id]
        
        # Save updated records
        with open('assessments.json', 'w') as f:
            json.dump(records, f, indent=2)
        
        return jsonify({"success": True, "message": "Assessment deleted"}), 200
    
    except Exception as e:
        print(f"Error deleting assessment: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/feedback', methods=['POST'])
def save_feedback():
    """Save user feedback"""
    try:
        data = request.json
        
        # Load existing feedback
        feedback_list = []
        if os.path.exists('feedback.json'):
            with open('feedback.json', 'r') as f:
                feedback_list = json.load(f)
        
        # Add new feedback
        feedback = {
            "id": int(datetime.now().timestamp() * 1000),
            **data
        }
        feedback_list.append(feedback)
        
        # Save feedback
        with open('feedback.json', 'w') as f:
            json.dump(feedback_list, f, indent=2)
        
        return jsonify({"success": True, "message": "Feedback saved"}), 201
    
    except Exception as e:
        print(f"Error saving feedback: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({"status": "ok", "message": "FamCare API is running"}), 200

# ============ ERROR HANDLERS ============

@app.errorhandler(404)
def not_found(error):
    return jsonify({"error": "Endpoint not found"}), 404

@app.errorhandler(500)
def server_error(error):
    return jsonify({"error": "Internal server error"}), 500

# ============ MAIN ============

if __name__ == '__main__':
    print("=" * 50)
    print("FamCare Backend API Starting...")
    print("=" * 50)
    print(f"Categories loaded: {len(sorted_categories)}")
    print(f"Questions loaded: {len(questions)}")
    print(f"Model input size: {input_size}")
    print(f"Model output size: {output_size}")
    print("=" * 50)
    print("Starting Flask server on http://localhost:5000")
    print("=" * 50)
    
    app.run(debug=True, host='localhost', port=5000)
