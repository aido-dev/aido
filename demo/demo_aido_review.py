"""
This script is designed to test the Aido PR review functionality.
It includes various Python constructs that a reviewer might comment on,
such as functions, classes, comments, docstrings, and simple logic.
"""

import os
import sys
import datetime

# Global constant (might be a good point for review, e.g.,
# naming convention or magic number)
MAX_ITEMS_PER_BATCH = 100


class DataProcessor:
    """
    A simple class to process a list of items.
    It simulates data handling and tracks basic statistics.
    """

    def __init__(self, name: str):
        self.processor_name = name
        self.processed_count = 0
        self.errors = []
        self.processing_log = []

    def process_item(self, item: dict) -> bool:
        """
        Simulates processing a single item.
        Returns True if successful, False otherwise.
        """
        if not isinstance(item, dict) or "id" not in item:
            error_msg = f"Invalid item format: {item}. Missing 'id' or not a dict."
            self.errors.append(error_msg)
            self.processing_log.append(f"ERROR: {error_msg}")
            return False

        item_id = item.get("id", "N/A")
        # Simulate some processing logic, perhaps a validation step
        if not isinstance(item.get("value"), (int, float)):
            error_msg = (
                f"Item ID {item_id}: 'value' is not a number. "
                f"Found {type(item.get('value'))}."
            )
            self.errors.append(error_msg)
            self.processing_log.append(f"WARNING: {error_msg}")
            # Even with a warning, we might still proceed or mark as partially processed
            # For this test, let's treat it as a soft error.
            print(
                f"[{self.processor_name}] WARNING on item ID: {item_id} "
                "- Value type mismatch."
            )

        print(f"[{self.processor_name}] Processing item ID: {item_id}")
        self.processed_count += 1
        self.processing_log.append(f"PROCESSED: {item_id}")
        return True

    def get_summary(self) -> str:
        """
        Returns a summary of the processing results.
        """
        return (
            f"Processor '{self.processor_name}' processed {self.processed_count} items."
            f"Encountered {len(self.errors)} errors/warnings."
        )

    def get_log(self) -> list[str]:
        """
        Returns the full processing log.
        """
        return self.processing_log


def generate_sample_data(num_items: int) -> list[dict]:
    """
    Generates a list of sample data items for testing.
    Includes some malformed data to trigger error paths.
    """
    data = []
    for i in range(num_items):
        item = {
            "id": f"item_{i:04d}",
            "value": i * 10,
            "timestamp": datetime.datetime.now().isoformat(),
        }
        if i % 7 == 0:  # Introduce an item with incorrect value type
            item["value"] = "not_a_number"
        if i % 13 == 0:  # Introduce an item missing 'id' for a different error
            del item["id"]
            item["alt_id"] = f"corrupt_{i:04d}"
        data.append(item)
    return data


def main():
    """
    Main function to orchestrate the data processing simulation.
    """
    print("Starting Aido PR review test script...")
    print(f"Current Python version: {sys.version.split(' ')[0]}")
    print(f"Current working directory: {os.getcwd()}")

    # Generate some data
    num_to_generate = 250  # More data to make batches more evident
    sample_data = generate_sample_data(num_to_generate)
    print(f"\nGenerated {len(sample_data)} sample items.")

    # Initialize processor
    processor = DataProcessor("AIDO_Test_Processor_v1")

    # Process data in batches
    for i in range(0, len(sample_data), MAX_ITEMS_PER_BATCH):
        batch = sample_data[i : i + MAX_ITEMS_PER_BATCH]
        print(
            f"\n--- Processing batch {i // MAX_ITEMS_PER_BATCH + 1} "
            f"(items {i + 1}-{min(i + MAX_ITEMS_PER_BATCH, len(sample_data))}) ---"
        )
        for item in batch:
            processor.process_item(item)

    # Print summary
    print("\n--- Processing Summary ---")
    print(processor.get_summary())
    if processor.errors:
        print("\nDetails on errors/warnings:")
        for error in processor.errors:
            print(f"  - {error}")

    # Optionally print full log (might be too verbose for large datasets,
    # a point for review)
    # print("\n--- Full Processing Log ---")
    # for entry in processor.get_log():
    #     print(entry)

    if processor.processed_count == num_to_generate - len(
        [e for e in processor.errors if "Invalid item format" in e]
    ):
        print(
            "\nAll expected items processed successfully "
            "(considering invalid items were skipped)."
        )
    else:
        print("\nMismatch in processed item count or unexpected errors!")
        sys.exit(1)  # Indicate failure in a real script

    print("\nAido PR review test script finished.")


if __name__ == "__main__":
    main()
