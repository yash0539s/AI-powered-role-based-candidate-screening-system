"""Role catalogue and the role -> knowledge-base mapping.

Each book is ingested once into the vector store and tagged with a `book_id`.
A role is simply a *view* over a set of books (metadata filter at query time),
so books can be shared across roles without duplicating embeddings.
"""
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Book:
    id: str
    title: str
    author: str
    url: str
    filename: str


@dataclass(frozen=True)
class Role:
    id: str
    title: str
    description: str
    book_ids: tuple[str, ...]
    core_areas: tuple[str, ...] = field(default_factory=tuple)
    category: str = "AI / Machine Learning"


BOOKS: dict[str, Book] = {
    b.id: b
    for b in [
        Book(
            "mitchell",
            "Machine Learning",
            "Tom Mitchell",
            "https://www.cs.cmu.edu/~tom/files/MachineLearningTomMitchell.pdf",
            "mitchell_machine_learning.pdf",
        ),
        Book(
            "burkov",
            "The Hundred-Page Machine Learning Book",
            "Andriy Burkov",
            "https://ema.cri-info.cm/wp-content/uploads/2019/07/2019BurkovTheHundred-pageMachineLearning.pdf",
            "burkov_hundred_page_ml.pdf",
        ),
        Book(
            "ml_beginners",
            "Machine Learning for Absolute Beginners",
            "Oliver Theobald",
            "https://www.hlevkin.com/hlevkin/45MachineDeepLearning/ML/Machine%20Learning%20For%20Absolute%20Beginners.pdf",
            "ml_absolute_beginners.pdf",
        ),
        Book(
            "muller_guido",
            "Introduction to Machine Learning with Python",
            "Andreas Müller & Sarah Guido",
            "https://www.nrigroupindia.com/e-book/Introduction%20to%20Machine%20Learning%20with%20Python%20%28%20PDFDrive.com%20%29-min.pdf",
            "intro_ml_with_python.pdf",
        ),
        Book(
            "brownlee",
            "Master Machine Learning Algorithms",
            "Jason Brownlee",
            "https://github.com/khurrameycon/Data-Science-Books/raw/main/Master%20Machine%20Learning%20Algorithms%20-%20Discover%20how%20they%20work%20and%20Implement%20Them%20From%20Scratch%20by%20Jason%20Brownlee%20%28z-lib.org%29.pdf",
            "brownlee_master_ml_algorithms.pdf",
        ),
        Book(
            "bishop",
            "Pattern Recognition and Machine Learning",
            "Christopher Bishop",
            "https://www.microsoft.com/en-us/research/wp-content/uploads/2006/01/Bishop-Pattern-Recognition-and-Machine-Learning-2006.pdf",
            "bishop_prml.pdf",
        ),
        Book(
            "ai_ml_dl",
            "Artificial Intelligence, Machine Learning & Deep Learning",
            "Mercury Learning",
            "https://jcer.in/jcer-docs/E-Learning/Digital%20Library%20/E-Books/Artificial%20Intelligence%2C%20Machine%20Learning%2C%20and%20Deep%20Learning.pdf",
            "ai_ml_deep_learning.pdf",
        ),
    ]
}



# ---------------------------------------------------------------------------
# Role catalogue — exactly the three roles defined in the assignment brief (section 9),
# each grounded ONLY in the textbooks the brief assigns to it.
# ---------------------------------------------------------------------------
ROLES: dict[str, Role] = {
    r.id: r
    for r in [
        Role(
            id="ai_ml_engineer",
            title="AI / ML Engineer",
            description="Core ML theory and algorithms: learning paradigms, model families, "
            "generalisation, evaluation and practical model building.",
            book_ids=("mitchell", "burkov", "ml_beginners"),
            core_areas=(
                "concept learning and hypothesis spaces",
                "decision trees",
                "neural networks and backpropagation",
                "bayesian learning",
                "evaluating hypotheses and overfitting",
                "supervised vs unsupervised learning",
                "regularization and the bias-variance trade-off",
                "gradient descent and optimisation",
            ),
            category="AI / Machine Learning",
        ),
        Role(
            id="data_scientist",
            title="Data Scientist / Applied ML",
            description="Hands-on, applied machine learning: preprocessing, feature engineering, "
            "model selection, pipelines and algorithm internals.",
            book_ids=("muller_guido", "brownlee"),
            core_areas=(
                "data preprocessing and scaling",
                "feature engineering",
                "model evaluation, cross-validation and grid search",
                "linear models and logistic regression",
                "tree ensembles: random forests and gradient boosting",
                "clustering and dimensionality reduction",
                "pipelines and avoiding data leakage",
                "k-nearest neighbours and support vector machines",
            ),
            category="Data Science / Applied ML",
        ),
        Role(
            id="ml_research",
            title="ML Research / Advanced ML",
            description="Theoretical and probabilistic ML: Bayesian inference, graphical models, "
            "kernel methods, latent-variable models and deep learning.",
            book_ids=("bishop", "ai_ml_dl"),
            core_areas=(
                "probability distributions and bayesian inference",
                "linear models for regression and classification",
                "kernel methods and support vector machines",
                "graphical models",
                "mixture models and the EM algorithm",
                "approximate inference",
                "neural networks and deep learning",
                "dimensionality reduction (PCA)",
            ),
            category="Advanced / Theoretical ML",
        ),
    ]
}

def get_role(role_id: str) -> Role | None:
    return ROLES.get(role_id)
