from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import numpy as np
import tensorflow as tf
import random
import nltk
from nltk.stem.lancaster import LancasterStemmer
import string
import os

# Initialize Flask app
app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///famcare.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Initialize extensions
db = SQLAlchemy(app)
CORS(app)

# Initialize the stemmer
stemmer = LancasterStemmer()

# Download nltk dependencies
try:
    nltk.download('punkt')
    nltk.download('stopwords')
except:
    pass

from nltk.corpus import stopwords
stop_words = stopwords.words('english')

punct_dict = dict((ord(punct), None) for punct in string.punctuation)

# ============ DATABASE MODELS ============

class ChatMessage(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    conversation_id = db.Column(db.String(50))
    user_message = db.Column(db.Text)
    bot_response = db.Column(db.Text)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'conversation_id': self.conversation_id,
            'user_message': self.user_message,
            'bot_response': self.bot_response,
            'timestamp': self.timestamp.strftime('%Y-%m-%d %H:%M:%S')
        }

class Feedback(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    feedback_type = db.Column(db.String(50))
    message = db.Column(db.Text)
    rating = db.Column(db.Integer)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'feedback_type': self.feedback_type,
            'message': self.message,
            'rating': self.rating,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S')
        }

# ============ CHATBOT SETUP ============

categories = []
questions = []
answers = []

# Load training data from aichatbot.txt
try:
    with open('backend/aichatbot.txt', 'r') as f:
        while True:
            line = f.readline().strip()
            if not line:
                break
            categories.append(line)
            questions.append(f.readline().lower().strip())
            answers.append(f.readline().lower().strip())
except:
    print("Warning: aichatbot.txt not found. Using default responses.")
    categories = ['family', 'parenting', 'relationships']
    questions = ['how do families work?', 'how to be a good parent?', 'how to improve relationships?']
    answers = ['Families are built on communication and trust.', 'Being patient and consistent is key.', 'Listen to each other and be understanding.']

# Tokenize and process training data
word_tokens_stop = []
questions_tokenized_stopped = []

for i, question in enumerate(questions):
    question = question.translate(punct_dict)
    tokens = nltk.word_tokenize(question)
    tokens_stop = [w for w in tokens if w not in stop_words]
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

# Build neural network model
if len(training) > 0:
    input_size = len(training[0])
    output_size = len(output[0])

    model = tf.keras.Sequential([
        tf.keras.layers.Input(shape=(input_size,)),
        tf.keras.layers.Dense(8, activation='relu'),
        tf.keras.layers.Dense(8, activation='relu'),
        tf.keras.layers.Dense(output_size, activation='softmax')
    ])

    model.compile(optimizer='adam', loss='categorical_crossentropy', metrics=['accuracy'])
    model.fit(training, output, epochs=100, batch_size=8, verbose=0)
else:
    model = None
    print("Warning: No training data available for chatbot.")

# ============ CHATBOT HELPER FUNCTIONS ============

def get_response(query):
    row = [0] * len(stemmed_words)
    query = query.lower().translate(punct_dict)
    tokens = nltk.word_tokenize(query)
    tokens_stop = [w for w in tokens if w not in stop_words]
    stemmed_tokens = [stemmer.stem(word) for word in tokens_stop]

    for stemmed_word in stemmed_tokens:
        for i, w in enumerate(stemmed_words):
            if w == stemmed_word:
                row[i] = 1

    return np.array(row)

def get_bot_response(user_message):
    if model is None or len(stemmed_words) == 0:
        return "I'm learning! Please try again later or rephrase your question."
    
    response_vector = get_response(user_message)
    results = model.predict(np.array([response_vector]), verbose=0)
    results_index = np.argmax(results)
    
    if results[0][results_index] < 0.3:
        return "I'm not sure about that. Could you ask something about family, parenting, or relationships?"
    
    tag = sorted_categories[results_index]
    responses = [answers[i] for i, category in enumerate(categories) if category == tag]
    
    return random.choice(responses) if responses else "I'm here to help with family-related questions!"

# ============ API ROUTES ============

@app.route('/api/chat', methods=['POST'])
def chat():
    try:
        data = request.json
        user_message = data.get('message', '').strip()
        conversation_id = data.get('conversation_id')
        
        if not user_message:
            return jsonify({'success': False, 'error': 'Empty message'}), 400
        
        # Generate conversation ID if not provided
        if not conversation_id:
            conversation_id = f'conv_{datetime.utcnow().timestamp()}'
        
        # Get bot response
        bot_response = get_bot_response(user_message)
        
        # Save to database
        chat_message = ChatMessage(
            conversation_id=conversation_id,
            user_message=user_message,
            bot_response=bot_response
        )
        db.session.add(chat_message)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'response': bot_response,
            'conversation_id': conversation_id
        })
    except Exception as e:
        print(f"Error: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/chat/history', methods=['GET'])
def get_chat_history():
    try:
        conversation_id = request.args.get('conversation_id')
        
        if conversation_id:
            messages = ChatMessage.query.filter_by(conversation_id=conversation_id).all()
        else:
            messages = ChatMessage.query.all()
        
        return jsonify({
            'success': True,
            'messages': [msg.to_dict() for msg in messages]
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/feedback', methods=['POST'])
def submit_feedback():
    try:
        data = request.json
        feedback = Feedback(
            feedback_type=data.get('type'),
            message=data.get('message'),
            rating=data.get('rating')
        )
        db.session.add(feedback)
        db.session.commit()
        
        return jsonify({'success': True, 'id': feedback.id})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/feedback', methods=['GET'])
def get_feedback():
    try:
        feedback_items = Feedback.query.order_by(Feedback.created_at.desc()).all()
        return jsonify({
            'success': True,
            'feedback': [item.to_dict() for item in feedback_items]
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/stats', methods=['GET'])
def get_stats():
    try:
        total_messages = ChatMessage.query.count()
        total_feedback = Feedback.query.count()
        avg_rating = db.session.query(db.func.avg(Feedback.rating)).scalar() or 0
        
        return jsonify({
            'success': True,
            'total_messages': total_messages,
            'total_feedback': total_feedback,
            'average_rating': round(float(avg_rating), 2)
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'healthy'})

# ============ CREATE TABLES ============

with app.app_context():
    db.create_all()

if __name__ == '__main__':
    app.run(debug=True, port=5000)
