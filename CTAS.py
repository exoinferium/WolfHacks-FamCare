# Canadian Triage and Acuity Scale Chatbot Diagnosis Model
import numpy as np
import tensorflow as tf
import random
import nltk
from nltk.stem.lancaster import LancasterStemmer
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

# Initialize stemmer
stemmer = LancasterStemmer()

# Download nltk dependencies
nltk.download('punkt')
nltk.download('stopwords')
from nltk.corpus import stopwords
stop_words = stopwords.words('english')

import string
punct_dict = dict((ord(punct), None) for punct in string.punctuation)

# Load and prepare data
categories = []
questions = []
answers = []

# read in file CTAS.txt
with open("CTAS.txt", "r") as f:
    lines = [line.strip() for line in f if line.strip()]

for i in range(0, len(lines), 3):
    categories.append(lines[i])
    questions.append(lines[i + 1].lower())
    answers.append(lines[i + 2].lower())
    
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

# Process questions
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

# Build the neural network using TensorFlow 2.x
input_size = len(training[0])
output_size = len(output[0])

# build model
model = tf.keras.Sequential([
    tf.keras.layers.Input(shape=(input_size,)),
    tf.keras.layers.Dense(8, activation='relu'),
    tf.keras.layers.Dense(8, activation='relu'),
    tf.keras.layers.Dense(output_size, activation='softmax')
])

# Compile the model
model.compile(optimizer='adam', loss='categorical_crossentropy', metrics=['accuracy'])

# Train the model
model.fit(training, output, epochs=1000, batch_size=8)

vectorizer = TfidfVectorizer()
X = vectorizer.fit_transform(questions)

# Function to process input and predict category
def get_response(query, words):
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

# Chat function
def chat():
    print("I am your CTAS diagnosis. Enter your symptoms and I will give you an estimate of the severity. Type 'X' to exit.")
    while True:
        query = input("> ")
        if query.lower() == "X":
            print("Have a nice day!")
            break

        response = get_response(query, stemmed_words)
        
        # make prediction
        results = model.predict(np.array([response]),verbose=0)
        results_index = np.argmax(results)
        tag = sorted_categories[results_index]
        print(tag)
        
        # tfidfvector cosine similarity
        query_vector = vectorizer.transform([query])
        similarities = cosine_similarity(query_vector, X)
        best_match_index = similarities.argmax()
        print(answers[best_match_index])

# Start
chat()
