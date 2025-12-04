import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    this.setState({
      error,
      errorInfo
    });
  }

  resetError = () => {
    this.setState({ 
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full p-8">
            <div className="text-center mb-6">
              <div className="text-6xl mb-4">⚠️</div>
              <h1 className="text-3xl font-bold text-red-600 mb-2">
                אופס! משהו השתבש
              </h1>
              <p className="text-gray-600">
                התוכנה נתקלה בשגיאה בלתי צפויה
              </p>
            </div>

            {this.state.error && (
              <div className="bg-gray-100 rounded-lg p-4 mb-6">
                <div className="font-bold text-sm text-gray-700 mb-2">
                  פרטי השגיאה:
                </div>
                <div className="text-xs font-mono text-red-600 overflow-auto max-h-32">
                  {this.state.error.toString()}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={this.resetError}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition"
              >
                🔄 נסה שוב
              </button>
              
              <button
                onClick={() => window.location.reload()}
                className="w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-6 rounded-lg transition"
              >
                ♻️ רענן דף
              </button>

              <div className="text-center text-sm text-gray-500 mt-4">
                <p>אם הבעיה נמשכת:</p>
                <ul className="list-disc list-inside text-right mt-2 space-y-1">
                  <li>נסה לסגור ולפתוח מחדש את התוכנה</li>
                  <li>בדוק שיש לך מקום פנוי בדיסק</li>
                  <li>ייצא את הנתונים שלך (גיבוי)</li>
                  <li>צור קשר עם התמיכה הטכנית</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;